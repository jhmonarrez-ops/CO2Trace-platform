# CO2Trace AWS backend

Accounts, shared company profiles and cloud storage for the ledger. The website stays a static page
(GitHub Pages today); everything private lives in AWS.

## Architecture

| Part | Service | Notes |
|---|---|---|
| Sign-in | Cognito user pool (Essentials, managed login) | Email + password (12+ chars), email verification, optional TOTP MFA, password reset. Google / Microsoft / SAML can be added as identity providers later. |
| API | API Gateway HTTP API → Lambda (Node 22, arm64) | JWT authorizer on the Cognito **ID token**; throttled to 50 req/s (burst 100); access logs kept 1 year. |
| Database | Aurora PostgreSQL 16 Serverless v2 + Data API | In isolated subnets with no internet route; reached only through the Data API. Encrypted, 14-day backups, deletion protection. `minAcu: 0` pauses it when idle (cheapest; first request after a pause waits ~15 s). Set `minAcu: 0.5` once clients use it daily. |
| Evidence files | S3 | Private, encrypted, TLS only, versioned (old versions kept 90 days). Browsers upload and download with 5-minute presigned links; S3 enforces the announced size and type. |
| Invitations | SES (optional) | Without SES, the admin gets an invite link to share. |
| Cost guard | AWS Budgets (optional) | Emails at 80 % of the monthly budget and when the forecast exceeds it. |

### Data separation (multi-tenant)
Every request runs in one transaction as the database role `co2trace_app`, with `app.user_sub` set to
the caller. That role owns no tables and has no `BYPASSRLS`, so Postgres **row-level security** filters
every statement by company membership, even if the API code had a bug. The API also checks roles first
to return clear 403/404 answers. Tests in `api/test` prove both layers (including raw SQL as another user).

### Roles

| Role | Can |
|---|---|
| viewer | Read the company's inventories, lines, evidence files, members and audit log (auditors, managers) |
| editor | + add, edit and delete lines and evidence; create inventories and edit their settings |
| admin | + invite and remove people, change roles up to admin, delete inventories, rename the company |
| owner | + grant or remove the owner role, delete the company. A company always keeps at least one owner. |

### Audit log
Database triggers record every insert, update and delete on companies, members, invitations,
inventories, lines (with before and after values) and evidence files, with who and when. The API role
can only read it.

### Concurrency
Lines and inventory settings carry a `version`. A save with a stale version gets `409` and the current
row, so two people editing the same line never silently overwrite each other.

## API

All routes need `Authorization: Bearer <Cognito ID token>`.

| Method | Path | Role |
|---|---|---|
| GET | `/me` | signed in |
| POST | `/companies` `{name, country: mx\|us, dataRegion: us\|mx}` | signed in (becomes owner) |
| GET / PATCH / DELETE | `/companies/:cid` | viewer / admin / owner |
| GET | `/companies/:cid/members` | viewer |
| PATCH / DELETE | `/companies/:cid/members/:sub` `{role}` | admin (owner for owners); anyone can remove themselves |
| GET / POST | `/companies/:cid/invitations` `{email, role}` | admin |
| DELETE | `/companies/:cid/invitations/:id` | admin |
| POST | `/invitations/accept` `{token}` | signed in, verified email matching the invitation |
| GET / POST | `/companies/:cid/inventories` `{year, settings}` | viewer / editor |
| GET / PATCH / DELETE | `/companies/:cid/inventories/:iid` `{settings, version}` | viewer / editor / admin |
| POST | `/companies/:cid/inventories/:iid/import` `{settings?, lines[{clientId, position, data}]}` (≤ 500 per call) | editor |
| POST | `/companies/:cid/inventories/:iid/lines` `{data, position, clientId?}` | editor |
| PATCH / DELETE | `/companies/:cid/lines/:lid` `{data?, position?, version}` | editor |
| POST | `/companies/:cid/lines/:lid/files` `{name, size, contentType}` → presigned upload | editor |
| POST | `/companies/:cid/files/:fid/complete` | editor |
| GET / DELETE | `/companies/:cid/files/:fid` | viewer / editor |
| GET | `/companies/:cid/audit?limit&before` | viewer |

A line's `data` is the ledger row object the page already uses (stage, key, supplier, qty, scope, months, evidence metadata);
inventory `settings` holds the project setup (company, year, functional unit, boundary, country, method, goal and scope).

## Deploying

One-time, by the account owner:
1. Create the AWS account, turn on MFA for the root user, and create an admin user in IAM Identity Center.
2. Install the AWS CLI and sign in: `aws configure sso`, then `aws sso login`.
3. `cd infra && npx cdk bootstrap` (once per account and region).

Each deploy:
```
cd api && npm ci && npm test
cd ../infra && npm ci
npx cdk deploy -c stage=prod --outputs-file outputs.json
node scripts/write-config.mjs prod     # writes ../co2trace.config.js for the website
```
Settings are in `infra/cdk.json` (`region`, `minAcu`, `maxAcu`, `mailFrom`, `sesDomain`, `alertEmail`, `monthlyBudgetUsd`, site URLs).

### Email (recommended before inviting clients)
Verify `co2trace.io` in SES (three DKIM CNAME records at GoDaddy), request SES production access,
then set `mailFrom: "CO2Trace <no-reply@co2trace.io>"` and `sesDomain: "co2trace.io"`. Cognito then sends
verification and reset emails from your domain (instead of 50/day from Cognito), and invitations are emailed.

## Later
- A second data region (México Central) per company: `companies.data_region` is already stored.
- Sign in with Google and Microsoft (Cognito identity providers) and SAML SSO for enterprise clients.
- Custom login domain `auth.co2trace.io` (ACM certificate in us-east-1).
- Host the site on S3 + CloudFront with security headers (CSP, HSTS).
- AWS WAF on the user pool, CloudTrail and GuardDuty at the account level.
