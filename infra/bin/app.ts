import { App } from 'aws-cdk-lib';
import { Co2TraceStack } from '../lib/co2trace-stack';

const app = new App();
const ctx = (k: string) => app.node.tryGetContext(k);
const stage: string = ctx('stage') ?? 'prod';
const cfg = { ...ctx('defaults'), ...(ctx('stages')?.[stage] ?? {}) };

new Co2TraceStack(app, `CO2Trace-${stage}`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: cfg.region },
  description: `CO2Trace backend (${stage})`,
  stage,
  siteUrls: cfg.siteUrls,
  authDomainPrefix: cfg.authDomainPrefix,
  minAcu: cfg.minAcu,
  maxAcu: cfg.maxAcu,
  mailFrom: cfg.mailFrom || undefined,
  sesDomain: cfg.sesDomain || undefined,
  alertEmail: cfg.alertEmail || undefined,
  monthlyBudgetUsd: cfg.monthlyBudgetUsd,
  ai: { helpModel: cfg.helpModel, extractModel: cfg.extractModel, helpPerVisitor: cfg.helpPerVisitor, helpPerDay: cfg.helpPerDay, docsPerMonth: cfg.docsPerMonth, helpConcurrency: cfg.helpConcurrency },
  tags: { app: 'co2trace', stage },
});
