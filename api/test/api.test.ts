import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, user } from './helpers.ts';

const ana = user('ana'), beto = user('beto'), caro = user('caro'), dani = user('dani');
const line = (qty: number) => ({ stage: 'materials', key: 'steel', qty, scope: 3, m0: 0, m1: 11 });

async function companyWithInventory(t: Awaited<ReturnType<typeof setup>>) {
  const c = (await t.as(ana).post('/companies', { name: 'Ventura Fans', country: 'mx' })).body as any;
  const inv = (await t.as(ana).post(`/companies/${c.id}/inventories`, { year: 2025, settings: { boundary: 'grave' } })).body as any;
  return { c, inv };
}

async function join(t: Awaited<ReturnType<typeof setup>>, cid: string, who: typeof ana, role: string) {
  const inv = (await t.as(ana).post(`/companies/${cid}/invitations`, { email: who.email, role })).body as any;
  const token = inv.link.split('#invite=')[1];
  return t.as(who).post('/invitations/accept', { token });
}

test('creating a company makes the creator its owner', async () => {
  const t = await setup();
  const r = await t.as(ana).post('/companies', { name: 'Ventura Fans', country: 'mx', dataRegion: 'us' });
  assert.equal(r.status, 201);
  assert.equal((r.body as any).role, 'owner');
  const me = (await t.as(ana).get('/me')).body as any;
  assert.deepEqual(me.companies.map((c: any) => [c.name, c.role]), [['Ventura Fans', 'owner']]);
});

test('companies are invisible to non-members, through the API and in the database itself', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(1000) });

  assert.equal((await t.as(beto).get(`/companies/${c.id}`)).status, 404);
  assert.equal((await t.as(beto).get(`/companies/${c.id}/inventories/${inv.id}`)).status, 404);
  assert.deepEqual(((await t.as(beto).get('/me')).body as any).companies, []);

  // Even raw SQL as the API role sees nothing and cannot write into another company.
  const rows = await t.db.asUser(beto.sub, tx => tx.query('select * from lines'));
  assert.equal(rows.length, 0);
  await assert.rejects(t.db.asUser(beto.sub, tx => tx.query(
    `insert into lines (company_id, inventory_id, data) values ($1::uuid, $2::uuid, '{}'::jsonb)`, [c.id, inv.id])), /row-level security/);
  await assert.rejects(t.db.asUser(beto.sub, tx => tx.query(
    `insert into memberships (company_id, user_sub, email, role) values ($1::uuid, $2, 'beto@example.com', 'owner')`, [c.id, beto.sub])), /row-level security/);
  const upd = await t.db.asUser(beto.sub, tx => tx.query(`update companies set name = 'pwned' where id = $1::uuid returning id`, [c.id]));
  assert.equal(upd.length, 0);
});

test('invitations: only the invited, verified email can accept, once', async () => {
  const t = await setup();
  const { c } = await companyWithInventory(t);
  const inv = (await t.as(ana).post(`/companies/${c.id}/invitations`, { email: 'Beto@Example.com', role: 'editor' })).body as any;
  assert.equal(inv.email, 'beto@example.com');
  assert.equal(inv.emailed, true);
  assert.equal(t.sent[0].to, 'beto@example.com');
  const token = inv.link.split('#invite=')[1];

  assert.equal((await t.as(caro).post('/invitations/accept', { token })).status, 403);
  assert.equal((await t.as(user('beto', false)).post('/invitations/accept', { token })).status, 403);
  const ok = await t.as(beto).post('/invitations/accept', { token });
  assert.equal(ok.status, 200);
  assert.equal((ok.body as any).role, 'editor');
  assert.equal((await t.as(beto).post('/invitations/accept', { token })).status, 404);
  assert.equal((await t.as(beto).post('/invitations/accept', { token: 'x'.repeat(43) })).status, 404);

  // Editors can't invite or see invitations; an owner role can't be offered by invitation.
  assert.equal((await t.as(beto).post(`/companies/${c.id}/invitations`, { email: 'x@example.com', role: 'viewer' })).status, 403);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/invitations`, { email: 'x@example.com', role: 'owner' })).status, 400);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/invitations`, { email: 'beto@example.com', role: 'viewer' })).status, 409);
});

test('roles: viewers read, editors write, admins manage people, owners manage owners', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  await join(t, c.id, beto, 'viewer');
  await join(t, c.id, caro, 'editor');
  await join(t, c.id, dani, 'admin');

  assert.equal((await t.as(beto).get(`/companies/${c.id}/inventories/${inv.id}`)).status, 200);
  assert.equal((await t.as(beto).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(1) })).status, 403);
  const l = await t.as(caro).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(5) });
  assert.equal(l.status, 201);
  assert.equal((await t.as(caro).patch(`/companies/${c.id}/members/${beto.sub}`, { role: 'editor' })).status, 403);
  assert.equal((await t.as(caro).del(`/companies/${c.id}/inventories/${inv.id}`)).status, 403);

  assert.equal((await t.as(dani).patch(`/companies/${c.id}/members/${beto.sub}`, { role: 'editor' })).status, 200);
  assert.equal((await t.as(dani).patch(`/companies/${c.id}/members/${beto.sub}`, { role: 'owner' })).status, 403);
  assert.equal((await t.as(dani).del(`/companies/${c.id}/members/${ana.sub}`)).status, 403);
  assert.equal((await t.as(dani).del(`/companies/${c.id}`)).status, 403);
  assert.equal((await t.as(ana).patch(`/companies/${c.id}/members/${dani.sub}`, { role: 'owner' })).status, 200);

  const members = (await t.as(beto).get(`/companies/${c.id}/members`)).body as any[];
  assert.deepEqual(members.map(m => [m.email, m.role]).sort(), [
    ['ana@example.com', 'owner'], ['beto@example.com', 'editor'], ['caro@example.com', 'editor'], ['dani@example.com', 'owner']]);
});

test('a company always keeps an owner; members can leave', async () => {
  const t = await setup();
  const { c } = await companyWithInventory(t);
  assert.equal((await t.as(ana).patch(`/companies/${c.id}/members/${ana.sub}`, { role: 'admin' })).status, 409);
  assert.equal((await t.as(ana).del(`/companies/${c.id}/members/${ana.sub}`)).status, 409);
  await join(t, c.id, beto, 'viewer');
  assert.equal((await t.as(beto).del(`/companies/${c.id}/members/${beto.sub}`)).status, 200);
  assert.equal((await t.as(beto).get(`/companies/${c.id}`)).status, 404);
});

test('concurrent edits: a stale version gets 409 with the current line', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  await join(t, c.id, beto, 'editor');
  const l = (await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(10) })).body as any;
  const a = await t.as(ana).patch(`/companies/${c.id}/lines/${l.id}`, { data: line(20), version: l.version });
  assert.equal(a.status, 200);
  const b = await t.as(beto).patch(`/companies/${c.id}/lines/${l.id}`, { data: line(30), version: l.version });
  assert.equal(b.status, 409);
  assert.equal((b.body as any).error.current.data.qty, 20);
});

test('import upserts browser lines by client id', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  const lines = [1, 2, 3].map(i => ({ clientId: `r${i}`, position: i, data: line(i * 100) }));
  const r1 = await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/import`, { settings: { boundary: 'gate', region: 'mx' }, lines });
  assert.equal((r1.body as any).imported, 3);
  lines[0].data.qty = 999;
  await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/import`, { lines });
  const full = (await t.as(ana).get(`/companies/${c.id}/inventories/${inv.id}`)).body as any;
  assert.equal(full.lines.length, 3);
  assert.equal(full.lines[0].data.qty, 999);
  assert.equal(full.lines[0].version, 2);
  assert.equal(full.inventory.settings.region, 'mx');
});

test('evidence files: type and size checks, upload confirmation, download, delete after commit', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  await join(t, c.id, beto, 'viewer');
  const l = (await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(1) })).body as any;
  const base = `/companies/${c.id}/lines/${l.id}/files`;

  assert.equal((await t.as(ana).post(base, { name: 'x.exe', size: 10, contentType: 'application/x-msdownload' })).status, 415);
  assert.equal((await t.as(ana).post(base, { name: 'big.pdf', size: 26 * 1024 * 1024, contentType: 'application/pdf' })).status, 413);
  assert.equal((await t.as(beto).post(base, { name: 'bill.pdf', size: 1234, contentType: 'application/pdf' })).status, 403);

  const up = (await t.as(ana).post(base, { name: 'CFE bill/2025.pdf', size: 1234, contentType: 'application/pdf' })).body as any;
  assert.equal(up.file.name, 'CFE bill_2025.pdf');
  assert.equal(up.upload.fields.key, `${c.id}/${up.file.id}`);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/files/${up.file.id}/complete`)).status, 409);
  t.objects.set(up.upload.fields.key, { size: 1234, contentType: 'application/pdf' });
  assert.equal((await t.as(ana).post(`/companies/${c.id}/files/${up.file.id}/complete`)).status, 200);

  const dl = (await t.as(beto).get(`/companies/${c.id}/files/${up.file.id}`)).body as any;
  assert.match(dl.url, /download=CFE%20bill_2025\.pdf/);
  assert.equal((await t.as(caro).get(`/companies/${c.id}/files/${up.file.id}`)).status, 404);
  const full = (await t.as(beto).get(`/companies/${c.id}/inventories/${inv.id}`)).body as any;
  assert.equal(full.files.length, 1);

  assert.equal((await t.as(ana).del(`/companies/${c.id}/lines/${l.id}`)).status, 200);
  assert.deepEqual(t.deleted, [up.upload.fields.key]);
});

test('audit log records who changed what', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  await join(t, c.id, beto, 'editor');
  const l = (await t.as(beto).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(10) })).body as any;
  await t.as(beto).patch(`/companies/${c.id}/lines/${l.id}`, { data: line(12), version: 1 });
  const log = (await t.as(ana).get(`/companies/${c.id}/audit`)).body as any[];
  const upd = log.find(e => e.entity === 'lines' && e.action === 'update');
  assert.equal(upd.actor, 'beto@example.com');
  assert.equal(upd.detail.before.qty, 10);
  assert.equal(upd.detail.after.qty, 12);
  assert.ok(log.some(e => e.entity === 'memberships' && e.action === 'insert' && e.detail.email === 'beto@example.com'));
  // The log is append-only for the API role.
  const del = await t.db.asUser(ana.sub, tx => tx.query('delete from audit_log returning id')).catch(e => e);
  assert.match(String(del.message ?? del), /permission denied/);
});

test('deleting a company removes its data, files and log', async () => {
  const t = await setup();
  const { c, inv } = await companyWithInventory(t);
  const l = (await t.as(ana).post(`/companies/${c.id}/inventories/${inv.id}/lines`, { data: line(1) })).body as any;
  const up = (await t.as(ana).post(`/companies/${c.id}/lines/${l.id}/files`, { name: 'a.pdf', size: 5, contentType: 'application/pdf' })).body as any;
  t.objects.set(up.upload.fields.key, { size: 5, contentType: 'application/pdf' });
  assert.equal((await t.as(ana).del(`/companies/${c.id}`)).status, 200);
  assert.equal(t.objects.size, 0);
  const left = await t.pg.query('select (select count(*) from lines) l, (select count(*) from audit_log) a, (select count(*) from memberships) m');
  assert.deepEqual(left.rows[0], { l: 0, a: 0, m: 0 });
});

test('bad input and unknown routes', async () => {
  const t = await setup();
  assert.equal((await t.as(ana).post('/companies', { name: '' })).status, 400);
  assert.equal((await t.as(ana).get('/companies/not-a-uuid')).status, 404);
  assert.equal((await t.as(ana).get('/nope')).status, 404);
  assert.equal((await t.as(ana).del('/me')).status, 405);
  const { c } = await companyWithInventory(t);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/inventories`, { year: 2025 })).status, 409);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/inventories/${c.id}/lines`, { data: line(1) })).status, 404);
});
