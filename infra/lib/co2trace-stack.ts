// CO2Trace backend: Cognito sign-in, Aurora PostgreSQL (Data API, row-level security),
// a Lambda API behind an HTTP API with a JWT authorizer, an S3 bucket for evidence files,
// and a custom resource that migrates the schema on every deploy.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { CfnOutput, CustomResource, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { CfnStage, CorsHttpMethod, HttpApi, HttpMethod, HttpNoneAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

export interface Co2TraceProps extends StackProps {
  stage: string;
  /** Site origins allowed to sign in and call the API; the first is used in invitation links. */
  siteUrls: string[];
  authDomainPrefix: string;
  /** Aurora capacity units. Min 0 pauses the database when idle (cheapest; ~15 s to wake). */
  minAcu: number;
  maxAcu: number;
  /** Verified SES sender, e.g. "CO2Trace <no-reply@co2trace.io>". Without it Cognito sends its own emails (50/day) and invitations are shared as links. */
  mailFrom?: string;
  sesDomain?: string;
  /** Email for the monthly budget alert. */
  alertEmail?: string;
  monthlyBudgetUsd: number;
  /** Claude through Amazon Bedrock: model IDs and the limits that keep cost bounded. */
  ai: { helpModel: string; extractModel: string; helpPerVisitor: number; helpPerDay: number; docsPerMonth: number;
    /** Reserved concurrency for the public help function (needs spare account concurrency; leave unset on new accounts). */
    helpConcurrency?: number };
}

const API_DIR = path.join(__dirname, '..', '..', 'api');

export class Co2TraceStack extends Stack {
  constructor(scope: Construct, id: string, props: Co2TraceProps) {
    super(scope, id, props);
    const prod = props.stage === 'prod';
    const keep = prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    /* ---------- Sign-in ---------- */
    const userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: `co2trace-${props.stage}`,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true } },
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      keepOriginal: { email: true },
      email: props.mailFrom && props.sesDomain
        ? cognito.UserPoolEmail.withSES({ fromEmail: /<(.+)>/.exec(props.mailFrom)?.[1] ?? props.mailFrom, fromName: 'CO2Trace', sesVerifiedDomain: props.sesDomain, sesRegion: this.region })
        : cognito.UserPoolEmail.withCognito(),
      deletionProtection: prod,
      removalPolicy: keep,
    });

    const callbacks = props.siteUrls.map(u => u.replace(/\/?$/, '/'));
    const client = userPool.addClient('Web', {
      userPoolClientName: 'co2trace-web',
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: callbacks,
        logoutUrls: callbacks,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const domain = userPool.addDomain('Login', {
      cognitoDomain: { domainPrefix: props.authDomainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    /* ---------- Database ---------- */
    // Isolated subnets only: nothing reaches the database except through the Data API.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2, natGateways: 0,
      subnetConfiguration: [{ name: 'db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });
    const dbName = 'co2trace';
    const cluster = new rds.DatabaseCluster(this, 'Db', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_16_13 }),
      credentials: rds.Credentials.fromGeneratedSecret('co2trace_admin'),
      defaultDatabaseName: dbName,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: props.minAcu,
      serverlessV2MaxCapacity: props.maxAcu,
      ...(props.minAcu === 0 ? { serverlessV2AutoPauseDuration: Duration.minutes(30) } : {}),
      enableDataApi: true,
      storageEncrypted: true,
      backup: { retention: Duration.days(prod ? 14 : 1), preferredWindow: '08:00-09:00' },
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // The API logs in as its own role, which row-level security applies to.
    const appSecret = new rds.DatabaseSecret(this, 'AppDbSecret', { username: 'co2trace_app' });
    appSecret.attach(cluster);

    /* ---------- Evidence files ---------- */
    const bucket = new s3.Bucket(this, 'Evidence', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: [{
        allowedOrigins: props.siteUrls,
        allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedHeaders: ['*'],
        maxAge: 3600,
      }],
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        // documents waiting to be read by the assistant; the worker deletes them once read
        { prefix: 'inbox/', expiration: Duration.days(1), noncurrentVersionExpiration: Duration.days(1) },
        { noncurrentVersionExpiration: Duration.days(90) },
      ],
      removalPolicy: keep,
      autoDeleteObjects: !prod,
    });

    /* ---------- Assistant state: rate counters and document-reading jobs (items expire by ttl) ---------- */
    const aiTable = new dynamodb.Table(this, 'Ai', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    /* ---------- Functions ---------- */
    const fn = (id: string, entry: string, extra: Partial<ConstructorParameters<typeof NodejsFunction>[2]> = {}) => new NodejsFunction(this, id, {
      entry: path.join(API_DIR, 'src', entry),
      projectRoot: API_DIR,
      depsLockFilePath: path.join(API_DIR, 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      bundling: { format: OutputFormat.CJS, minify: true, sourceMap: true, externalModules: [], target: 'node22' },
      logGroup: new logs.LogGroup(this, `${id}Logs`, { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: keep }),
      ...extra,
    });

    const migrate = fn('Migrate', 'migrate.ts', {
      timeout: Duration.minutes(10),
      environment: { CLUSTER_ARN: cluster.clusterArn, MASTER_SECRET_ARN: cluster.secret!.secretArn, APP_SECRET_ARN: appSecret.secretArn, DB_NAME: dbName },
    });
    cluster.grantDataApiAccess(migrate);
    appSecret.grantRead(migrate);
    const migrations = readFileSync(path.join(API_DIR, 'src', 'db', 'migrations.ts'), 'utf8');
    const schema = new CustomResource(this, 'Schema', {
      serviceToken: new Provider(this, 'SchemaProvider', { onEventHandler: migrate }).serviceToken,
      properties: { hash: createHash('sha256').update(migrations).digest('hex') },
    });
    schema.node.addDependency(cluster, appSecret);

    const siteUrl = props.siteUrls[0].replace(/\/$/, '');
    const api = fn('Api', 'lambda.ts', {
      timeout: Duration.seconds(29),
      environment: {
        CLUSTER_ARN: cluster.clusterArn, APP_SECRET_ARN: appSecret.secretArn, DB_NAME: dbName,
        BUCKET: bucket.bucketName, SITE_URL: siteUrl, NODE_OPTIONS: '--enable-source-maps',
        ...(props.mailFrom ? { MAIL_FROM: props.mailFrom } : {}),
      },
    });
    // Least privilege: Data API calls with the app secret only (never the master secret).
    api.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'],
      resources: [cluster.clusterArn],
    }));
    appSecret.grantRead(api);
    bucket.grantReadWrite(api);
    bucket.grantDelete(api);
    if (props.mailFrom && props.sesDomain) {
      api.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${props.sesDomain}`],
      }));
    }
    api.node.addDependency(schema);
    aiTable.grantReadWriteData(api);
    api.addEnvironment('AI_TABLE', aiTable.tableName);
    api.addEnvironment('DOCS_PER_MONTH', String(props.ai.docsPerMonth));

    // Claude in Amazon Bedrock (bedrock-mantle endpoint), called with the function's role.
    const bedrock = new iam.PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'] });
    const aiEnv = { AI_TABLE: aiTable.tableName, BEDROCK_REGION: this.region, HELP_MODEL: props.ai.helpModel, EXTRACT_MODEL: props.ai.extractModel, NODE_OPTIONS: '--enable-source-maps' };

    // Public help chat: no database, no bucket; only the counters table and Bedrock.
    const help = fn('Help', 'public.ts', {
      timeout: Duration.seconds(29),
      environment: { ...aiEnv, HELP_PER_VISITOR: String(props.ai.helpPerVisitor), HELP_PER_DAY: String(props.ai.helpPerDay) },
      ...(props.ai.helpConcurrency ? { reservedConcurrentExecutions: props.ai.helpConcurrency } : {}),
    });
    help.addToRolePolicy(bedrock);
    aiTable.grantReadWriteData(help);

    // Reads each upload to inbox/<cid>/<job> and stores the proposed lines on the job.
    const reader = fn('Reader', 'worker.ts', { timeout: Duration.minutes(5), memorySize: 1024, environment: { ...aiEnv, BUCKET: bucket.bucketName } });
    reader.addToRolePolicy(bedrock);
    aiTable.grantReadWriteData(reader);
    bucket.grantRead(reader, 'inbox/*');
    bucket.grantDelete(reader, 'inbox/*');
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(reader), { prefix: 'inbox/' });

    /* ---------- HTTP API ---------- */
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `co2trace-${props.stage}`,
      corsPreflight: {
        allowOrigins: props.siteUrls,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.days(1),
      },
      defaultAuthorizer: new HttpJwtAuthorizer('Cognito', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
        jwtAudience: [client.userPoolClientId],
      }),
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', api),
    });
    httpApi.addRoutes({ path: '/assistant/help', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('HelpIntegration', help), authorizer: new HttpNoneAuthorizer() });
    const accessLogs = new logs.LogGroup(this, 'ApiAccessLogs', { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: keep });
    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 100, throttlingRateLimit: 50 };
    stage.routeSettings = { 'POST /assistant/help': { throttlingBurstLimit: 10, throttlingRateLimit: 3 } };
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({ requestId: '$context.requestId', ip: '$context.identity.sourceIp', sub: '$context.authorizer.claims.sub',
        method: '$context.httpMethod', path: '$context.path', status: '$context.status', ms: '$context.responseLatency', at: '$context.requestTime' }),
    };

    /* ---------- Cost guard ---------- */
    if (props.alertEmail) {
      new budgets.CfnBudget(this, 'Budget', {
        budget: { budgetName: `co2trace-${props.stage}-monthly`, budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' } },
        notificationsWithSubscribers: [
          { notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE' }, subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }] },
          { notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' }, subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }] },
        ],
      });
    }

    /* ---------- Outputs (public values the website needs) ---------- */
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'AuthDomain', { value: domain.baseUrl() });
    new CfnOutput(this, 'EvidenceBucket', { value: bucket.bucketName });
  }
}
