// CO2Trace API: companies, members and roles, invitations, inventories, ledger lines,
// evidence files and the audit log. Transport-agnostic: `createApp` takes a request and its
// verified identity and returns a response; lambda.ts adapts API Gateway events to it.
//
// Authorization is enforced twice: `need()` checks the caller's role to give clear 403/404
// answers, and Postgres row-level security filters every statement regardless.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DbError, type Db, type Tx } from './db/db.ts';

export type Role = 'viewer' | 'editor' | 'admin' | 'owner';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export interface Identity { sub: string; email: string; emailVerified: boolean; }
export interface Req { method: string; path: string; query?: Record<string, string | undefined>; body?: unknown; identity: Identity; }
export interface Res { status: number; body: unknown; }

export interface Storage {
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<{ url: string; fields: Record<string, string> }>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  presignDownload(key: string, filename: string, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}
export interface Mailer { sendInvite(to: string, p: { company: string; inviter: string; role: Role; link: string }): Promise<boolean>; }

export interface AppConfig { siteUrl: string; maxFileBytes?: number; }

export class HttpError extends Error {
  status: number; code: string; extra?: unknown;
  constructor(status: number, code: string, message: string, extra?: unknown) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

// Evidence documents: bills, invoices, manifests, certificates, spreadsheets, photos.
export const FILE_TYPES = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/xml', 'text/xml', // Mexican CFDI invoices
]);

const uuid = z.string().uuid();
const jsonObject = (max: number) => z.record(z.unknown()).refine(o => JSON.stringify(o).length <= max, `must be under ${max} characters as JSON`);
const S = {
  company: z.object({ name: z.string().trim().min(1).max(200), country: z.enum(['mx', 'us']).default('mx'), dataRegion: z.enum(['us', 'mx']).default('us') }),
  companyPatch: z.object({ name: z.string().trim().min(1).max(200).optional(), country: z.enum(['mx', 'us']).optional() }),
  role: z.object({ role: z.enum(['viewer', 'editor', 'admin', 'owner']) }),
  invite: z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(['viewer', 'editor', 'admin']) }),
  accept: z.object({ token: z.string().min(20).max(200) }),
  inventory: z.object({ year: z.number().int().min(1990).max(2100), settings: jsonObject(50_000).default({}) }),
  inventoryPatch: z.object({ settings: jsonObject(50_000), version: z.number().int() }),
  line: z.object({ data: jsonObject(20_000), position: z.number().int().min(0).default(0), clientId: z.string().max(100).optional() }),
  linePatch: z.object({ data: jsonObject(20_000).optional(), position: z.number().int().min(0).optional(), version: z.number().int() }),
  import: z.object({ settings: jsonObject(50_000).optional(), lines: z.array(z.object({ clientId: z.string().min(1).max(100), position: z.number().int().min(0), data: jsonObject(20_000) })).max(500) }),
  file: z.object({ name: z.string().trim().min(1).max(255), size: z.number().int().positive(), contentType: z.string() }),
};

function parse<T>(schema: z.ZodType<T, any, any>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, 'invalid_request', r.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

/** Returns the caller's role in the company, or throws 404 (not a member) / 403 (role too low). */
async function need(tx: Tx, cid: string, min: Role): Promise<Role> {
  if (!uuid.safeParse(cid).success) throw new HttpError(404, 'not_found', 'Company not found');
  const [r] = await tx.query<{ role: Role | null }>('select app.role_in($1::uuid) as role', [cid]);
  if (!r?.role) throw new HttpError(404, 'not_found', 'Company not found');
  if (RANK[r.role] < RANK[min]) throw new HttpError(403, 'forbidden', `This needs the ${min} role or higher; you are ${r.role}`);
  return r.role;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const safeName = (n: string) => n.replace(/[\\/\x00-\x1f"]/g, '_');

// `after` queues work (S3 deletions) to run only once the transaction has committed.
type Handler = (ctx: { tx: Tx; req: Req; p: Record<string, string>; me: Identity; after: (fn: () => Promise<void>) => void }) => Promise<Res>;
const ok = (body: unknown, status = 200): Res => ({ status, body });

export function createApp(deps: { db: Db; storage: Storage; mailer?: Mailer; config: AppConfig }) {
  const { db, storage, mailer, config } = deps;
  const maxFile = config.maxFileBytes ?? 25 * 1024 * 1024;
  const routes: [string, RegExp, string[], Handler][] = [];
  const on = (method: string, pattern: string, h: Handler) => {
    const names: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
    routes.push([method, re, names, h]);
  };

  /* ---- me ---- */
  on('GET', '/me', async ({ tx, me }) => ok({
    sub: me.sub, email: me.email,
    companies: await tx.query(`select c.id, c.name, c.country, c.data_region, m.role
      from memberships m join companies c on c.id = m.company_id where m.user_sub = app.current_sub() order by c.name`),
  }));

  /* ---- companies ---- */
  on('POST', '/companies', async ({ tx, req, me }) => {
    const b = parse(S.company, req.body);
    const [r] = await tx.query('select app.create_company($1, $2, $3, $4) as id', [b.name, b.country, b.dataRegion, me.email]);
    const [c] = await tx.query('select * from companies where id = $1::uuid', [r.id]);
    return ok({ ...c, role: 'owner' }, 201);
  });
  on('GET', '/companies/:cid', async ({ tx, p }) => {
    const role = await need(tx, p.cid, 'viewer');
    const [c] = await tx.query('select * from companies where id = $1::uuid', [p.cid]);
    return ok({ ...c, role });
  });
  on('PATCH', '/companies/:cid', async ({ tx, p, req }) => {
    await need(tx, p.cid, 'admin');
    const b = parse(S.companyPatch, req.body);
    const [c] = await tx.query(`update companies set name = coalesce($2, name), country = coalesce($3, country)
      where id = $1::uuid returning *`, [p.cid, b.name ?? null, b.country ?? null]);
    return ok(c);
  });
  on('DELETE', '/companies/:cid', async ({ tx, p, after }) => {
    await need(tx, p.cid, 'owner');
    await tx.query('delete from companies where id = $1::uuid', [p.cid]);
    after(() => storage.deletePrefix(`${p.cid}/`));
    return ok({ deleted: true });
  });

  /* ---- members ---- */
  on('GET', '/companies/:cid/members', async ({ tx, p }) => {
    await need(tx, p.cid, 'viewer');
    return ok(await tx.query('select user_sub, email, role, created_at from memberships where company_id = $1::uuid order by role desc, email', [p.cid]));
  });
  on('PATCH', '/companies/:cid/members/:sub', async ({ tx, p, req }) => {
    const mine = await need(tx, p.cid, 'admin');
    const { role } = parse(S.role, req.body);
    const [cur] = await tx.query<{ role: Role }>('select role from memberships where company_id = $1::uuid and user_sub = $2', [p.cid, p.sub]);
    if (!cur) throw new HttpError(404, 'not_found', 'Member not found');
    if ((role === 'owner' || cur.role === 'owner') && mine !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can grant or remove the owner role');
    const [m] = await tx.query('update memberships set role = $3::member_role where company_id = $1::uuid and user_sub = $2 returning user_sub, email, role', [p.cid, p.sub, role]);
    return ok(m);
  });
  on('DELETE', '/companies/:cid/members/:sub', async ({ tx, p, me }) => {
    const self = p.sub === me.sub;
    const mine = await need(tx, p.cid, self ? 'viewer' : 'admin');
    const [cur] = await tx.query<{ role: Role }>('select role from memberships where company_id = $1::uuid and user_sub = $2', [p.cid, p.sub]);
    if (!cur) throw new HttpError(404, 'not_found', 'Member not found');
    if (!self && cur.role === 'owner' && mine !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can remove another owner');
    await tx.query('delete from memberships where company_id = $1::uuid and user_sub = $2', [p.cid, p.sub]);
    return ok({ removed: true });
  });

  /* ---- invitations ---- */
  on('GET', '/companies/:cid/invitations', async ({ tx, p }) => {
    await need(tx, p.cid, 'admin');
    return ok(await tx.query(`select id, email, role, invited_by, created_at, expires_at from invitations
      where company_id = $1::uuid and accepted_at is null and expires_at > now() order by created_at desc`, [p.cid]));
  });
  on('POST', '/companies/:cid/invitations', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'admin');
    const b = parse(S.invite, req.body);
    const [already] = await tx.query('select 1 from memberships where company_id = $1::uuid and email = $2', [p.cid, b.email]);
    if (already) throw new HttpError(409, 'already_member', `${b.email} is already a member`);
    await tx.query('delete from invitations where company_id = $1::uuid and email = $2 and accepted_at is null', [p.cid, b.email]);
    const token = randomBytes(32).toString('base64url');
    const [inv] = await tx.query(`insert into invitations (company_id, email, role, token_hash, invited_by)
      values ($1::uuid, $2, $3::member_role, $4, $5) returning id, email, role, expires_at`, [p.cid, b.email, b.role, hashToken(token), me.email]);
    const [c] = await tx.query('select name from companies where id = $1::uuid', [p.cid]);
    const link = `${config.siteUrl}/#invite=${token}`;
    const emailed = mailer ? await mailer.sendInvite(b.email, { company: c.name, inviter: me.email, role: b.role, link }).catch(() => false) : false;
    return ok({ ...inv, link, emailed }, 201);
  });
  on('DELETE', '/companies/:cid/invitations/:id', async ({ tx, p }) => {
    await need(tx, p.cid, 'admin');
    if (!uuid.safeParse(p.id).success) throw new HttpError(404, 'not_found', 'Invitation not found');
    await tx.query('delete from invitations where id = $1::uuid and company_id = $2::uuid', [p.id, p.cid]);
    return ok({ revoked: true });
  });
  on('POST', '/invitations/accept', async ({ tx, req, me }) => {
    if (!me.emailVerified) throw new HttpError(403, 'email_unverified', 'Verify your email address before joining a company');
    const { token } = parse(S.accept, req.body);
    const [r] = await tx.query('select app.accept_invitation($1, $2) as company_id', [hashToken(token), me.email]);
    const [c] = await tx.query(`select c.id, c.name, c.country, c.data_region, m.role from companies c
      join memberships m on m.company_id = c.id and m.user_sub = app.current_sub() where c.id = $1::uuid`, [r.company_id]);
    return ok(c);
  });

  /* ---- inventories ---- */
  on('GET', '/companies/:cid/inventories', async ({ tx, p }) => {
    await need(tx, p.cid, 'viewer');
    return ok(await tx.query(`select i.id, i.year, i.version, i.updated_at, i.updated_by, count(l.id)::int as lines
      from inventories i left join lines l on l.inventory_id = i.id where i.company_id = $1::uuid group by i.id order by i.year desc`, [p.cid]));
  });
  on('POST', '/companies/:cid/inventories', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.inventory, req.body);
    const [dup] = await tx.query('select id from inventories where company_id = $1::uuid and year = $2', [p.cid, b.year]);
    if (dup) throw new HttpError(409, 'exists', `There is already a ${b.year} inventory`, { id: dup.id });
    const [inv] = await tx.query(`insert into inventories (company_id, year, settings, updated_by)
      values ($1::uuid, $2, $3::jsonb, $4) returning *`, [p.cid, b.year, b.settings, me.sub]);
    return ok(inv, 201);
  });
  on('GET', '/companies/:cid/inventories/:iid', async ({ tx, p }) => {
    const role = await need(tx, p.cid, 'viewer');
    const inv = await inventoryOf(tx, p.cid, p.iid);
    const lines = await tx.query('select id, client_id, position, data, version, updated_at, updated_by from lines where inventory_id = $1::uuid order by position, created_at', [inv.id]);
    const files = await tx.query(`select f.id, f.line_id, f.name, f.size, f.content_type, f.uploaded_by, f.uploaded_at from evidence_files f
      join lines l on l.id = f.line_id where l.inventory_id = $1::uuid and f.status = 'stored' order by f.uploaded_at`, [inv.id]);
    return ok({ inventory: inv, role, lines, files });
  });
  on('PATCH', '/companies/:cid/inventories/:iid', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.inventoryPatch, req.body);
    await inventoryOf(tx, p.cid, p.iid);
    const [inv] = await tx.query(`update inventories set settings = $3::jsonb, version = version + 1, updated_at = now(), updated_by = $4
      where id = $1::uuid and company_id = $2::uuid and version = $5 returning *`, [p.iid, p.cid, b.settings, me.sub, b.version]);
    if (!inv) throw new HttpError(409, 'conflict', 'Someone else changed these settings; reload to see their version', await inventoryOf(tx, p.cid, p.iid));
    return ok(inv);
  });
  on('DELETE', '/companies/:cid/inventories/:iid', async ({ tx, p, after }) => {
    await need(tx, p.cid, 'admin');
    const inv = await inventoryOf(tx, p.cid, p.iid);
    const keys = await tx.query<{ s3_key: string }>('select f.s3_key from evidence_files f join lines l on l.id = f.line_id where l.inventory_id = $1::uuid', [inv.id]);
    await tx.query('delete from inventories where id = $1::uuid', [inv.id]);
    after(async () => { for (const k of keys) await storage.delete(k.s3_key); });
    return ok({ deleted: true });
  });
  // Bulk upsert by clientId: moves a browser ledger to the cloud (send up to 500 lines per call).
  on('POST', '/companies/:cid/inventories/:iid/import', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.import, req.body);
    const inv = await inventoryOf(tx, p.cid, p.iid);
    if (b.settings) await tx.query('update inventories set settings = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3 where id = $1::uuid', [inv.id, b.settings, me.sub]);
    const rows = b.lines.map(l => ({ client_id: l.clientId, position: l.position, data: l.data }));
    const res = await tx.query(`insert into lines (company_id, inventory_id, client_id, position, data, created_by, updated_by)
      select $1::uuid, $2::uuid, x.client_id, x.position, x.data, $3, $3 from jsonb_to_recordset($4::jsonb) as x(client_id text, position int, data jsonb)
      on conflict (inventory_id, client_id) do update set data = excluded.data, position = excluded.position,
        version = lines.version + 1, updated_at = now(), updated_by = excluded.updated_by
      returning id, client_id, version`, [p.cid, inv.id, me.sub, rows]);
    return ok({ imported: res.length, lines: res });
  });

  /* ---- lines ---- */
  on('POST', '/companies/:cid/inventories/:iid/lines', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.line, req.body);
    const inv = await inventoryOf(tx, p.cid, p.iid);
    const [l] = await tx.query(`insert into lines (company_id, inventory_id, client_id, position, data, created_by, updated_by)
      values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $6) returning *`, [p.cid, inv.id, b.clientId ?? randomUUID(), b.position, b.data, me.sub]);
    return ok(l, 201);
  });
  on('PATCH', '/companies/:cid/lines/:lid', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.linePatch, req.body);
    const cur = await lineOf(tx, p.cid, p.lid);
    const [l] = await tx.query(`update lines set data = coalesce($3::jsonb, data), position = coalesce($4, position),
        version = version + 1, updated_at = now(), updated_by = $5
      where id = $1::uuid and company_id = $2::uuid and version = $6 returning *`, [p.lid, p.cid, b.data ?? null, b.position ?? null, me.sub, b.version]);
    if (!l) throw new HttpError(409, 'conflict', 'Someone else changed this line; reload to see their version', cur);
    return ok(l);
  });
  on('DELETE', '/companies/:cid/lines/:lid', async ({ tx, p, after }) => {
    await need(tx, p.cid, 'editor');
    const l = await lineOf(tx, p.cid, p.lid);
    const keys = await tx.query<{ s3_key: string }>('select s3_key from evidence_files where line_id = $1::uuid', [l.id]);
    await tx.query('delete from lines where id = $1::uuid', [l.id]);
    after(async () => { for (const k of keys) await storage.delete(k.s3_key); });
    return ok({ deleted: true });
  });

  /* ---- evidence files ---- */
  on('POST', '/companies/:cid/lines/:lid/files', async ({ tx, p, req, me }) => {
    await need(tx, p.cid, 'editor');
    const b = parse(S.file, req.body);
    if (!FILE_TYPES.has(b.contentType)) throw new HttpError(415, 'unsupported_type', `Files of type ${b.contentType || 'unknown'} can't be attached as evidence`);
    if (b.size > maxFile) throw new HttpError(413, 'too_large', `Files can be up to ${Math.round(maxFile / 1048576)} MB`);
    const l = await lineOf(tx, p.cid, p.lid);
    const id = randomUUID();
    const key = `${p.cid}/${id}`;
    const [f] = await tx.query(`insert into evidence_files (id, company_id, line_id, s3_key, name, size, content_type, uploaded_by)
      values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8) returning id, line_id, name, size, content_type, status`,
      [id, p.cid, l.id, key, safeName(b.name), b.size, b.contentType, me.email]);
    return ok({ file: f, upload: await storage.presignUpload(key, b.contentType, b.size) }, 201);
  });
  on('POST', '/companies/:cid/files/:fid/complete', async ({ tx, p }) => {
    await need(tx, p.cid, 'editor');
    const f = await fileOf(tx, p.cid, p.fid);
    const obj = await storage.head(f.s3_key);
    if (!obj) throw new HttpError(409, 'not_uploaded', 'The file has not arrived yet');
    if (obj.size !== Number(f.size)) { await storage.delete(f.s3_key); throw new HttpError(409, 'size_mismatch', 'The uploaded file is not the size announced'); }
    const [done] = await tx.query(`update evidence_files set status = 'stored' where id = $1::uuid
      returning id, line_id, name, size, content_type, uploaded_by, uploaded_at`, [f.id]);
    return ok(done);
  });
  on('GET', '/companies/:cid/files/:fid', async ({ tx, p }) => {
    await need(tx, p.cid, 'viewer');
    const f = await fileOf(tx, p.cid, p.fid);
    if (f.status !== 'stored') throw new HttpError(404, 'not_found', 'File not found');
    return ok({ url: await storage.presignDownload(f.s3_key, f.name, f.content_type), name: f.name });
  });
  on('DELETE', '/companies/:cid/files/:fid', async ({ tx, p, after }) => {
    await need(tx, p.cid, 'editor');
    const f = await fileOf(tx, p.cid, p.fid);
    await tx.query('delete from evidence_files where id = $1::uuid', [f.id]);
    after(() => storage.delete(f.s3_key));
    return ok({ deleted: true });
  });

  /* ---- audit log ---- */
  on('GET', '/companies/:cid/audit', async ({ tx, p, req }) => {
    await need(tx, p.cid, 'viewer');
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const before = Number(req.query?.before) || null;
    return ok(await tx.query(`select a.id, a.at, a.action, a.entity, a.entity_id, a.detail, coalesce(m.email, a.user_sub) as actor
      from audit_log a left join memberships m on m.company_id = a.company_id and m.user_sub = a.user_sub
      where a.company_id = $1::uuid and ($2::bigint is null or a.id < $2) order by a.id desc limit $3`, [p.cid, before, limit]));
  });

  async function inventoryOf(tx: Tx, cid: string, iid: string) {
    const [inv] = uuid.safeParse(iid).success ? await tx.query('select * from inventories where id = $1::uuid and company_id = $2::uuid', [iid, cid]) : [];
    if (!inv) throw new HttpError(404, 'not_found', 'Inventory not found');
    return inv;
  }
  async function lineOf(tx: Tx, cid: string, lid: string) {
    const [l] = uuid.safeParse(lid).success ? await tx.query('select * from lines where id = $1::uuid and company_id = $2::uuid', [lid, cid]) : [];
    if (!l) throw new HttpError(404, 'not_found', 'Line not found');
    return l;
  }
  async function fileOf(tx: Tx, cid: string, fid: string) {
    const [f] = uuid.safeParse(fid).success ? await tx.query('select * from evidence_files where id = $1::uuid and company_id = $2::uuid', [fid, cid]) : [];
    if (!f) throw new HttpError(404, 'not_found', 'File not found');
    return f;
  }

  return async function handle(req: Req): Promise<Res> {
    const path = req.path.replace(/\/+$/, '') || '/';
    let matched = false;
    for (const [method, re, names, h] of routes) {
      const m = re.exec(path);
      if (!m) continue;
      matched = true;
      if (method !== req.method) continue;
      const p = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      try {
        const queued: (() => Promise<void>)[] = [];
        const res = await db.asUser(req.identity.sub, tx => h({ tx, req, p, me: req.identity, after: fn => queued.push(fn) }));
        for (const fn of queued) await fn().catch(e => console.error('post-commit cleanup failed', e));
        return res;
      } catch (e: any) {
        if (e instanceof HttpError) return { status: e.status, body: { error: { code: e.code, message: e.message, current: e.extra } } };
        if (e instanceof DbError) {
          if (e.code === '42501') return { status: 403, body: { error: { code: 'forbidden', message: e.message.includes('row-level security') ? 'Not allowed' : e.message } } };
          if (e.code === 'P0002') return { status: 404, body: { error: { code: 'not_found', message: e.message } } };
          if (e.code === '23514') return { status: 409, body: { error: { code: 'conflict', message: e.message } } };
          if (e.code === '23505') return { status: 409, body: { error: { code: 'exists', message: 'That already exists' } } };
        }
        console.error('unhandled', e);
        return { status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } };
      }
    }
    return matched ? { status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' } } }
      : { status: 404, body: { error: { code: 'not_found', message: 'No such endpoint' } } };
  };
}
