import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { helpAnswer, extractDocument, type MessagesClient, type ExtractResult } from '../src/assistant.ts';
import { memoryJobs, memoryLimiter } from '../src/ai-store.ts';
import { createWorker } from '../src/worker.ts';
import { createPublic } from '../src/public.ts';
import { setup, user } from './helpers.ts';

const cfg = { helpModel: 'anthropic.claude-opus-5-5', extractModel: 'anthropic.claude-opus-5-5' };
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } as Anthropic.Usage;
const msg = (text: string, stop: Anthropic.StopReason = 'end_turn') => ({ id: 'm', type: 'message', role: 'assistant', model: cfg.helpModel, content: [{ type: 'text', text }], stop_reason: stop, usage } as unknown as Anthropic.Message);
function fake(reply: (p: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = { messages: { async create(p) { calls.push(p); return reply(p); } } };
  return { client, calls };
}
const READ: ExtractResult = {
  is_supported_document: true, doc_type: 'elec_bill', supplier: 'CFE', reference: '123456789012', issue_date: '2025-04-05', period_start: '2025-03', period_end: '2025-03', currency: 'MXN',
  lines: [{ activity: 'electricity', description: 'Consumo de energía', quantity: 125000, unit: 'kWh', amount: 312000, period_start: '2025-03', period_end: '2025-03', confidence: 'high', source_text: 'Consumo total 125,000 kWh' }],
  notes: '',
};

test('help: fixed cached system prompt, low effort, ledger summary as data, history alternates', async () => {
  const { client, calls } = fake(() => msg('Tu huella es de 24,463 t CO₂e.'));
  const r = await helpAnswer(client, cfg, { question: '¿Cuál es mi huella?', lang: 'es', context: 'total 24463 t', history: [
    { role: 'assistant', text: 'hola' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'assistant', text: 'c' }, { role: 'user', text: 'dangling' }] });
  assert.equal(r.answer, 'Tu huella es de 24,463 t CO₂e.');
  const p = calls[0];
  assert.equal(p.model, 'anthropic.claude-opus-5-5');
  assert.deepEqual(p.output_config, { effort: 'low' });
  assert.equal((p.system as Anthropic.TextBlockParam[])[0].cache_control?.type, 'ephemeral');
  assert.deepEqual(p.messages.map(m => m.role), ['user', 'assistant', 'user']);
  assert.equal(p.messages[0].content, 'a\n\nb');
  assert.match(String(p.messages[2].content), /<ledger_summary>\ntotal 24463 t\n<\/ledger_summary>/);
  assert.match(String(p.messages[2].content), /¿Cuál es mi huella\?$/);
});

test('help: refusals answer politely; bad input is a 400', async () => {
  const { client } = fake(() => msg('', 'refusal'));
  assert.match((await helpAnswer(client, cfg, { question: 'x', lang: 'en' })).answer, /can’t help/);
  await assert.rejects(helpAnswer(client, cfg, { question: '' }), (e: any) => e.status === 400);
  await assert.rejects(helpAnswer(client, cfg, { question: 'q'.repeat(2000) }), (e: any) => e.status === 400);
});

test('extract: PDF goes as a document block with a JSON schema; text files as text; others refused', async () => {
  const { client, calls } = fake(() => msg(JSON.stringify(READ)));
  const r = await extractDocument(client, cfg, { name: 'recibo.pdf', contentType: 'application/pdf', data: Buffer.from('%PDF').toString('base64'), lang: 'es', region: 'mx' });
  assert.equal(r.result.lines[0].quantity, 125000);
  const c = calls[0].messages[0].content as Anthropic.ContentBlockParam[];
  assert.equal(c[0].type, 'document');
  assert.equal((calls[0].output_config as any).format.type, 'json_schema');
  assert.match((c[1] as Anthropic.TextBlockParam).text, /México/);
  await extractDocument(client, cfg, { name: 'f.xml', contentType: 'application/xml', data: Buffer.from('<cfdi:Comprobante/>').toString('base64') });
  assert.equal(((calls[1].messages[0].content as any)[0].source).type, 'text');
  await assert.rejects(extractDocument(client, cfg, { name: 'a.docx', contentType: 'application/msword', data: 'AA==' }), (e: any) => e.status === 415);
});

test('extract: unreadable or truncated answers are errors, never half-parsed lines', async () => {
  await assert.rejects(extractDocument(fake(() => msg('not json')).client, cfg, { name: 'a.pdf', contentType: 'application/pdf', data: 'AA==' }), (e: any) => e.code === 'bad_output');
  await assert.rejects(extractDocument(fake(() => msg('{"lines":[]}')).client, cfg, { name: 'a.pdf', contentType: 'application/pdf', data: 'AA==' }), (e: any) => e.code === 'bad_output');
  await assert.rejects(extractDocument(fake(() => msg('{', 'max_tokens')).client, cfg, { name: 'a.pdf', contentType: 'application/pdf', data: 'AA==' }), (e: any) => e.code === 'too_long');
});

test('extract routes: editors get a job and an upload form; limits, types and other people are refused', async () => {
  const jobs = memoryJobs(), limiter = memoryLimiter();
  const t = await setup({ ai: { jobs, limiter, monthlyDocs: 2 } });
  const ana = user('ana'), beto = user('beto');
  const c = (await t.as(ana).post('/companies', { name: 'Cerro Alto', country: 'mx' })).body as any;
  const r = await t.as(ana).post(`/companies/${c.id}/extract`, { name: 'recibo.pdf', size: 1000, contentType: 'application/pdf', lang: 'es', region: 'mx' });
  assert.equal(r.status, 201);
  const { job, upload } = r.body as any;
  assert.equal(upload.fields.key, `inbox/${c.id}/${job}`);
  assert.equal(jobs.jobs.get(job)!.status, 'upload');
  assert.equal((await t.as(ana).post(`/companies/${c.id}/extract`, { name: 'a.docx', size: 10, contentType: 'application/msword' })).status, 415);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/extract`, { name: 'big.pdf', size: 11 * 1048576, contentType: 'application/pdf' })).status, 413);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/extract`, { name: 'b.pdf', size: 10, contentType: 'application/pdf' })).status, 201);
  assert.equal((await t.as(ana).post(`/companies/${c.id}/extract`, { name: 'c.pdf', size: 10, contentType: 'application/pdf' })).status, 429);
  assert.equal((await t.as(beto).post(`/companies/${c.id}/extract`, { name: 'x.pdf', size: 10, contentType: 'application/pdf' })).status, 404);
  assert.equal((await t.as(beto).get(`/companies/${c.id}/extract/${job}`)).status, 404);
  const g = await t.as(ana).get(`/companies/${c.id}/extract/${job}`);
  assert.equal((g.body as any).status, 'upload');
});

test('worker: reads the upload once, stores the lines and empties the inbox', async () => {
  const jobs = memoryJobs(), deleted: string[] = [];
  const { client, calls } = fake(() => msg(JSON.stringify(READ)));
  const cid = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222', key = `inbox/${cid}/${id}`;
  await jobs.create({ id, cid, sub: 's', name: 'recibo.pdf', contentType: 'application/pdf', size: 4, lang: 'es', region: 'mx', status: 'upload', createdAt: '' });
  const run = createWorker({ client, cfg, jobs, inbox: { async read() { return Buffer.from('%PDF'); }, async delete(k) { deleted.push(k); } } });
  await run(key, 4);
  await run(key, 4); // S3 can deliver an event twice
  assert.equal(calls.length, 1);
  assert.equal(jobs.jobs.get(id)!.status, 'done');
  assert.equal(jobs.jobs.get(id)!.result!.supplier, 'CFE');
  assert.deepEqual(deleted, [key]);

  const id2 = '33333333-3333-4333-8333-333333333333';
  await jobs.create({ id: id2, cid, sub: 's', name: 'r.pdf', contentType: 'application/pdf', size: 4, lang: 'en', region: 'us', status: 'upload', createdAt: '' });
  await run(`inbox/${cid}/${id2}`, 999);
  assert.equal(jobs.jobs.get(id2)!.status, 'failed');
  assert.match(jobs.jobs.get(id2)!.error!, /size/);
  assert.equal(calls.length, 1);
});

test('public help: per-visitor and daily limits, answers in the asker’s language', async () => {
  const { client, calls } = fake(() => msg('Scope 2 is purchased energy.'));
  const h = createPublic({ client, cfg, limiter: memoryLimiter(), perVisitor: 2, perDay: 3 });
  const ev = (ip: string, body: unknown) => ({ body: JSON.stringify(body), isBase64Encoded: false, requestContext: { http: { method: 'POST', sourceIp: ip } } } as any);
  const a = await h(ev('1.1.1.1', { question: 'What is Scope 2?' })) as any;
  assert.equal(a.statusCode, 200);
  assert.equal(JSON.parse(a.body).answer, 'Scope 2 is purchased energy.');
  await h(ev('1.1.1.1', { question: 'again' }));
  const limited = await h(ev('1.1.1.1', { question: 'third', lang: 'es' })) as any;
  assert.equal(limited.statusCode, 429);
  assert.match(JSON.parse(limited.body).error.message, /límite/);
  assert.equal((await h(ev('2.2.2.2', { question: 'hi' })) as any).statusCode, 200);
  assert.equal((await h(ev('3.3.3.3', { question: 'hi' })) as any).statusCode, 429); // the day's cap for everyone
  assert.equal(calls.length, 3);
  assert.equal((await h(ev('4.4.4.4', 'not json') as any) as any).statusCode, 400);
});
