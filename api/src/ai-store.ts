// DynamoDB adapters for the assistant: usage counters (rate limits) and document-reading jobs.
// One table, key `pk`, items expire through the `ttl` attribute.
//   rate#ip#<ip>#<day>      public help questions per visitor per day
//   rate#all#<day>          public help questions per day, all visitors (cost cap)
//   rate#co#<cid>#<month>   documents read per company per month
//   job#<id>                one document-reading job

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { ExtractResult } from './assistant.ts';

export interface Limiter {
  /** Counts one use of `key`; false (and nothing counted) once `max` is reached. */
  hit(key: string, max: number, ttlSeconds: number): Promise<boolean>;
}
export type JobStatus = 'upload' | 'running' | 'done' | 'failed';
export interface Job {
  id: string; cid: string; sub: string; name: string; contentType: string; size: number; lang: 'en' | 'es'; region: 'us' | 'mx';
  status: JobStatus; result?: ExtractResult; error?: string; createdAt: string;
}
export interface JobStore {
  create(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  /** Moves a job to `status` only if it is in one of `from`; false if it was not. */
  set(id: string, status: JobStatus, from: JobStatus[], extra?: { result?: ExtractResult; error?: string }): Promise<boolean>;
}

const now = () => Math.floor(Date.now() / 1000);

export function dynamoLimiter(table: string, ddb = new DynamoDBClient({})): Limiter {
  return {
    async hit(key, max, ttlSeconds) {
      try {
        await ddb.send(new UpdateItemCommand({
          TableName: table, Key: { pk: { S: `rate#${key}` } },
          UpdateExpression: 'ADD n :one SET #ttl = if_not_exists(#ttl, :ttl)',
          ConditionExpression: 'attribute_not_exists(n) OR n < :max',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':one': { N: '1' }, ':max': { N: String(max) }, ':ttl': { N: String(now() + ttlSeconds) } },
        }));
        return true;
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return false;
        throw e;
      }
    },
  };
}

export function dynamoJobs(table: string, ddb = new DynamoDBClient({})): JobStore {
  const DAY = 86400;
  return {
    async create(job) {
      await ddb.send(new PutItemCommand({
        TableName: table, Item: { pk: { S: `job#${job.id}` }, job: { S: JSON.stringify(job) }, ttl: { N: String(now() + DAY) } },
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
    },
    async get(id) {
      const r = await ddb.send(new GetItemCommand({ TableName: table, Key: { pk: { S: `job#${id}` } }, ConsistentRead: true }));
      return r.Item?.job?.S ? JSON.parse(r.Item.job.S) as Job : null;
    },
    async set(id, status, from, extra = {}) {
      const cur = await this.get(id);
      if (!cur || !from.includes(cur.status)) return false;
      const next: Job = { ...cur, status, ...extra };
      try {
        await ddb.send(new PutItemCommand({
          TableName: table, Item: { pk: { S: `job#${id}` }, job: { S: JSON.stringify(next) }, st: { S: status }, ttl: { N: String(now() + DAY) } },
          // the job must still be in the status we read (no double run from a retried event)
          ConditionExpression: 'attribute_not_exists(st) OR st = :was',
          ExpressionAttributeValues: { ':was': { S: cur.status } },
        }));
        return true;
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return false;
        throw e;
      }
    },
  };
}

/** In-memory versions for tests and local runs. */
export function memoryLimiter(): Limiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return { counts, async hit(key, max) { const n = counts.get(key) ?? 0; if (n >= max) return false; counts.set(key, n + 1); return true; } };
}
export function memoryJobs(): JobStore & { jobs: Map<string, Job> } {
  const jobs = new Map<string, Job>();
  return {
    jobs,
    async create(job) { if (jobs.has(job.id)) throw new Error('exists'); jobs.set(job.id, structuredClone(job)); },
    async get(id) { const j = jobs.get(id); return j ? structuredClone(j) : null; },
    async set(id, status, from, extra = {}) { const j = jobs.get(id); if (!j || !from.includes(j.status)) return false; jobs.set(id, { ...j, status, ...extra }); return true; },
  };
}
