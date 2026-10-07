// CloudFormation custom resource: runs pending migrations as the master user on every deploy,
// creates the API login role from its own secret, and re-applies its grants.

import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { migrations, grantsSql, APP_ROLE, migrationStatement, quote } from './db/migrations.ts';

const rds = new RDSDataClient({});
const sm = new SecretsManagerClient({});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function handler(event: { RequestType: string; PhysicalResourceId?: string }) {
  if (event.RequestType === 'Delete') return { PhysicalResourceId: event.PhysicalResourceId };
  const base = { resourceArn: process.env.CLUSTER_ARN!, secretArn: process.env.MASTER_SECRET_ARN!, database: process.env.DB_NAME! };

  const exec = async (sql: string) => {
    for (let attempt = 0; ; attempt++) {
      try { return await rds.send(new ExecuteStatementCommand({ ...base, sql, formatRecordsAs: 'JSON' })); }
      catch (e: any) { if (e?.name === 'DatabaseResumingException' && attempt < 20) { await sleep(5000); continue; } throw e; }
    }
  };

  await exec('create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())');
  const done = new Set(JSON.parse((await exec('select id from schema_migrations')).formattedRecords || '[]').map((r: any) => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await exec(migrationStatement(m));
    applied.push(m.id);
  }

  const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: process.env.APP_SECRET_ARN! }));
  const { password } = JSON.parse(SecretString!);
  await exec(`do $r$ begin
    if not exists (select 1 from pg_roles where rolname = ${quote(APP_ROLE)}) then
      create role ${APP_ROLE} login password ${quote(password)} nobypassrls;
    else
      alter role ${APP_ROLE} login password ${quote(password)} nobypassrls;
    end if; end $r$`);
  for (const stmt of grantsSql.split(';').map(s => s.trim()).filter(Boolean)) await exec(stmt);

  return { PhysicalResourceId: 'co2trace-schema', Data: { applied: applied.join(',') || 'none' } };
}
