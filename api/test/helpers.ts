import { PGlite } from '@electric-sql/pglite';
import { createApp, type AiDeps, type Identity, type Mailer, type Storage } from '../src/app.ts';
import { pgliteDb, type Db } from '../src/db/db.ts';
import { migrations, grantsSql, APP_ROLE, migrationStatement } from '../src/db/migrations.ts';

export async function setup(opts: { ai?: AiDeps } = {}) {
  const pg = new PGlite();
  await pg.exec('create table schema_migrations (id text primary key, applied_at timestamptz not null default now())');
  for (const m of migrations) await pg.exec(migrationStatement(m));
  await pg.exec(`create role ${APP_ROLE} nologin nobypassrls; ${grantsSql}`);

  const objects = new Map<string, { size: number; contentType: string }>();
  const deleted: string[] = [];
  const storage: Storage = {
    async presignUpload(key, contentType, size) { return { url: 'https://s3.test/bucket', fields: { key, 'Content-Type': contentType, size: String(size) } }; },
    async head(key) { return objects.get(key) ?? null; },
    async presignDownload(key, filename) { return `https://s3.test/bucket/${key}?download=${encodeURIComponent(filename)}`; },
    async delete(key) { objects.delete(key); deleted.push(key); },
    async deletePrefix(prefix) { for (const k of [...objects.keys()]) if (k.startsWith(prefix)) { objects.delete(k); deleted.push(k); } },
  };
  const sent: { to: string; link: string }[] = [];
  const mailer: Mailer = { async sendInvite(to, p) { sent.push({ to, link: p.link }); return true; } };

  const db: Db = pgliteDb(pg as any);
  const handle = createApp({ db, storage, mailer, config: { siteUrl: 'https://co2trace.io' }, ai: opts.ai });
  const as = (identity: Identity) => ({
    get: (path: string, query?: Record<string, string>) => handle({ method: 'GET', path, query, identity }),
    post: (path: string, body?: unknown) => handle({ method: 'POST', path, body, identity }),
    patch: (path: string, body?: unknown) => handle({ method: 'PATCH', path, body, identity }),
    del: (path: string) => handle({ method: 'DELETE', path, identity }),
  });
  return { pg, db, as, objects, deleted, sent };
}

export const user = (name: string, verified = true): Identity => ({ sub: `sub-${name}`, email: `${name}@example.com`, emailVerified: verified });
