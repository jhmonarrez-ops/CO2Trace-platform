// API Gateway (HTTP API, JWT authorizer on the Cognito ID token) → createApp.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createApp } from './app.ts';
import { dataApiDb } from './db/db.ts';
import { s3Storage, sesMailer } from './aws.ts';
import { dynamoJobs, dynamoLimiter } from './ai-store.ts';

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing env ${k}`); return v; };

const handle = createApp({
  db: dataApiDb({ resourceArn: env('CLUSTER_ARN'), secretArn: env('APP_SECRET_ARN'), database: env('DB_NAME') }),
  storage: s3Storage(env('BUCKET')),
  mailer: process.env.MAIL_FROM ? sesMailer(process.env.MAIL_FROM) : undefined,
  config: { siteUrl: env('SITE_URL') },
  ai: process.env.AI_TABLE ? { jobs: dynamoJobs(process.env.AI_TABLE), limiter: dynamoLimiter(process.env.AI_TABLE), monthlyDocs: Number(process.env.DOCS_PER_MONTH) || 300 } : undefined,
});

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  // Only ID tokens carry the email; access tokens are refused so invitations can trust it.
  if (claims.token_use !== 'id' || !claims.sub || !claims.email) {
    return json(401, { error: { code: 'unauthorized', message: 'Sign in again' } });
  }
  let body: unknown;
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
    catch { return json(400, { error: { code: 'invalid_json', message: 'Body must be JSON' } }); }
  }
  const res = await handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters,
    body,
    identity: { sub: String(claims.sub), email: String(claims.email).toLowerCase(), emailVerified: String(claims.email_verified) === 'true' },
  });
  return json(res.status, res.body);
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } };
}
