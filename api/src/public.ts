// Public help chat: POST /assistant/help, no sign-in. Its own function with no database access.
// Limits: questions per visitor (source IP) per day, checked first so a visitor over their own limit
// doesn't use up the shared daily cap, then per day for everyone, so cost stays bounded;
// API Gateway throttles the route and the function has reserved concurrency on top of that.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AssistantError, helpAnswer, helpInput, type AssistantConfig, type MessagesClient } from './assistant.ts';
import { dynamoLimiter, type Limiter } from './ai-store.ts';
import { assistantConfig, bedrockClient } from './bedrock.ts';

export interface PublicDeps { client: MessagesClient; cfg: AssistantConfig; limiter: Limiter; perVisitor: number; perDay: number; }

export function createPublic(d: PublicDeps) {
  return async function handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    if (event.requestContext.http.method !== 'POST') return json(405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });
    let body: unknown;
    try { body = JSON.parse(event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '{}'); }
    catch { return json(400, { error: { code: 'invalid_json', message: 'Body must be JSON' } }); }
    // invalid questions are refused before they count against any limit
    const v = helpInput.safeParse(body ?? {});
    if (!v.success) return json(400, { error: { code: 'invalid_request', message: 'Send { question, lang?, history?, context? }' } });
    const day = new Date().toISOString().slice(0, 10), ip = event.requestContext.http.sourceIp || 'unknown';
    const es = (body as { lang?: string })?.lang === 'es';
    if (!await d.limiter.hit(`ip#${ip}#${day}`, d.perVisitor, 2 * 86400)) return json(429, { error: { code: 'limit', message: es ? 'Llegaste al límite de preguntas de hoy. Crea una cuenta para seguir.' : 'You have reached today’s question limit. Create an account to keep going.' } });
    if (!await d.limiter.hit(`all#${day}`, d.perDay, 2 * 86400)) return json(429, { error: { code: 'busy', message: es ? 'El asistente llegó a su límite de hoy. Inténtalo mañana.' : 'The assistant has reached today’s limit. Try again tomorrow.' } });
    try {
      const { answer, usage } = await helpAnswer(d.client, d.cfg, body);
      console.log(JSON.stringify({ at: 'help', in: usage.input_tokens, out: usage.output_tokens, cacheRead: usage.cache_read_input_tokens ?? 0 }));
      return json(200, { answer });
    } catch (e) {
      if (e instanceof AssistantError) return json(e.status, { error: { code: e.code, message: e.message } });
      console.error('help failed', e);
      return json(502, { error: { code: 'upstream', message: es ? 'El asistente no respondió. Inténtalo de nuevo.' : 'The assistant did not answer. Try again.' } });
    }
  };
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } };
}

let handleFn: ReturnType<typeof createPublic> | undefined;
export async function handler(event: APIGatewayProxyEventV2) {
  handleFn ??= createPublic({
    client: bedrockClient(), cfg: assistantConfig(), limiter: dynamoLimiter(process.env.AI_TABLE!),
    perVisitor: Number(process.env.HELP_PER_VISITOR) || 30, perDay: Number(process.env.HELP_PER_DAY) || 1500,
  });
  return handleFn(event);
}
