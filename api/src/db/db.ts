// Database access. Every API request runs inside one transaction as the API role, with
// app.user_sub set to the caller, so row-level security sees who is asking.
// Two adapters: the RDS Data API (AWS) and PGlite (tests and local development).

import {
  RDSDataClient, BeginTransactionCommand, CommitTransactionCommand, ExecuteStatementCommand,
  RollbackTransactionCommand, type SqlParameter,
} from '@aws-sdk/client-rds-data';
import { APP_ROLE } from './migrations.ts';

export type Row = Record<string, any>;
export interface Tx { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>; }
export interface Db { asUser<T>(sub: string, fn: (tx: Tx) => Promise<T>): Promise<T>; }

/** A Postgres error with its SQLSTATE code, whichever adapter raised it. */
export class DbError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const JSON_COLS = new Set(['data', 'settings', 'detail']);

// Same shape from both adapters: ISO timestamps, plain numbers, parsed JSON columns.
function normalize(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'bigint') out[k] = Number(v);
    else if (typeof v === 'string' && JSON_COLS.has(k)) out[k] = JSON.parse(v);
    else if (typeof v === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?$/.test(v)) out[k] = new Date(v.replace(' ', 'T') + 'Z').toISOString();
    else out[k] = v;
  }
  return out;
}

/* ---------- PGlite ---------- */

interface PgLike {
  transaction<T>(fn: (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>): Promise<T>;
}

export function pgliteDb(pg: PgLike): Db {
  return {
    asUser(sub, fn) {
      return pg.transaction(async t => {
        const q = async (sql: string, params: unknown[] = []) => {
          try { return (await t.query(sql, params.map(p => p !== null && typeof p === 'object' ? JSON.stringify(p) : p))).rows.map(normalize); }
          catch (e: any) { throw new DbError(e.code || 'XX000', e.message); }
        };
        await q(`set local role ${APP_ROLE}`);
        await q(`select set_config('app.user_sub', $1, true)`, [sub]);
        return fn({ query: q as Tx['query'] });
      });
    },
  };
}

/* ---------- RDS Data API ---------- */

function toParam(name: string, v: unknown): SqlParameter {
  if (v === null || v === undefined) return { name, value: { isNull: true } };
  if (typeof v === 'boolean') return { name, value: { booleanValue: v } };
  if (typeof v === 'number') return Number.isInteger(v) ? { name, value: { longValue: v } } : { name, value: { doubleValue: v } };
  if (typeof v === 'object') return { name, value: { stringValue: JSON.stringify(v) } };
  return { name, value: { stringValue: String(v) } };
}

// "ERROR: new row violates row-level security policy ...; SQLState: 42501"
function dataApiError(e: any): Error {
  const m = /SQLState: (\w{5})/.exec(e?.message || '');
  if (m) return new DbError(m[1], e.message.replace(/^ERROR:\s*/, '').replace(/;?\s*SQLState: \w{5}.*$/s, ''));
  return e;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function dataApiDb(opts: { resourceArn: string; secretArn: string; database: string; client?: RDSDataClient }): Db {
  const client = opts.client ?? new RDSDataClient({});
  const base = { resourceArn: opts.resourceArn, secretArn: opts.secretArn, database: opts.database };

  // Aurora Serverless v2 pauses when idle; the first call after a pause waits for it to resume.
  async function send<T>(cmd: any): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await client.send(cmd) as T; }
      catch (e: any) {
        if (e?.name === 'DatabaseResumingException' && attempt < 8) { await sleep(2500); continue; }
        throw dataApiError(e);
      }
    }
  }

  return {
    async asUser(sub, fn) {
      const { transactionId } = await send<{ transactionId: string }>(new BeginTransactionCommand(base));
      const q = async (sql: string, params: unknown[] = []) => {
        const named = sql.replace(/\$(\d+)/g, ':p$1');
        const res = await send<{ formattedRecords?: string }>(new ExecuteStatementCommand({
          ...base, transactionId, sql: named, formatRecordsAs: 'JSON',
          parameters: params.map((v, i) => toParam(`p${i + 1}`, v)),
        }));
        return (res.formattedRecords ? JSON.parse(res.formattedRecords) : []).map(normalize);
      };
      try {
        await q(`select set_config('app.user_sub', $1, true)`, [sub]);
        const out = await fn({ query: q as Tx['query'] });
        await send(new CommitTransactionCommand({ resourceArn: base.resourceArn, secretArn: base.secretArn, transactionId }));
        return out;
      } catch (e) {
        await send(new RollbackTransactionCommand({ resourceArn: base.resourceArn, secretArn: base.secretArn, transactionId })).catch(() => {});
        throw e;
      }
    },
  };
}
