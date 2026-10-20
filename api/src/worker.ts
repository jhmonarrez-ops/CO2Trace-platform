// Reads one uploaded document (S3 event on inbox/<cid>/<job>) with the assistant and stores the
// proposed lines on the job. Never throws for a document problem: the job says what went wrong,
// so Lambda's automatic retries can't run (and bill) the same document twice.

import type { S3Event } from 'aws-lambda';
import { AssistantError, extractDocument, type AssistantConfig, type MessagesClient } from './assistant.ts';
import { dynamoJobs, type JobStore } from './ai-store.ts';
import { assistantConfig, bedrockClient } from './bedrock.ts';
import { s3Inbox, type Inbox } from './aws.ts';

export interface WorkerDeps { client: MessagesClient; cfg: AssistantConfig; jobs: JobStore; inbox: Inbox; }

export function createWorker(d: WorkerDeps) {
  return async function run(key: string, size: number) {
    const m = /^inbox\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/.exec(key);
    if (!m) return;
    const [, cid, id] = m, job = await d.jobs.get(id);
    if (!job || job.cid !== cid) { await d.inbox.delete(key); return; }
    if (!await d.jobs.set(id, 'running', ['upload'])) return; // already taken by an earlier delivery
    try {
      if (size !== job.size) throw new AssistantError(409, 'size_mismatch', 'The uploaded file is not the size announced');
      const data = (await d.inbox.read(key)).toString('base64');
      const { result, usage } = await extractDocument(d.client, d.cfg, { name: job.name, contentType: job.contentType, data, lang: job.lang, region: job.region });
      console.log(JSON.stringify({ at: 'extract', cid, lines: result.lines.length, in: usage.input_tokens, out: usage.output_tokens }));
      await d.jobs.set(id, 'done', ['running'], { result });
    } catch (e) {
      const msg = e instanceof AssistantError ? e.message : 'The document could not be read; try again';
      if (!(e instanceof AssistantError)) console.error('extract failed', e);
      await d.jobs.set(id, 'failed', ['running'], { error: msg });
    } finally {
      await d.inbox.delete(key).catch(err => console.error('inbox cleanup failed', err));
    }
  };
}

let runFn: ReturnType<typeof createWorker> | undefined;
export async function handler(event: S3Event) {
  runFn ??= createWorker({ client: bedrockClient(), cfg: assistantConfig(), jobs: dynamoJobs(process.env.AI_TABLE!), inbox: s3Inbox(process.env.BUCKET!) });
  for (const r of event.Records) await runFn(decodeURIComponent(r.s3.object.key.replace(/\+/g, ' ')), r.s3.object.size);
}
