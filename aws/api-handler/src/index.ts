import { APIGatewayProxyEventV2, Context } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { ConsoleLoggerProvider } from "@mcma/core";
import { getPublicUrl, McmaApiKeySecurityMiddleware, McmaApiMiddleware, McmaApiRouteCollection } from "@mcma/api";
import { AuthProvider, mcmaApiKeyAuth, ResourceManagerProvider } from "@mcma/client";
import { getTableName } from "@mcma/data";
import { ApiGatewayApiController } from "@mcma/aws-api-gateway";
import { awsV4Auth } from "@mcma/aws-client";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";
import { AwsSecretsManagerSecretsProvider } from "@mcma/aws-secrets-manager";

import { DataController } from "@local/job-processor";
import { JobRoutes } from "./job-routes";
import { JobExecutionRoutes } from "./job-execution-routes";

const dynamoDBClient = AWSXRay.captureAWSv3Client(new DynamoDBClient({}));
const lambdaClient = AWSXRay.captureAWSv3Client(new LambdaClient({}));
const secretsManagerClient = AWSXRay.captureAWSv3Client(new SecretsManagerClient({}));

const secretsProvider = new AwsSecretsManagerSecretsProvider({ client: secretsManagerClient });
const authProvider = new AuthProvider().add(awsV4Auth()).add(mcmaApiKeyAuth({ secretsProvider }));
const loggerProvider = new ConsoleLoggerProvider("job-processor-api-handler");
const resourceManagerProvider = new ResourceManagerProvider(authProvider);
const workerInvoker = new LambdaWorkerInvoker(lambdaClient);

const dataController = new DataController(getTableName(), getPublicUrl(), false, dynamoDBClient);
const jobRoutes = new JobRoutes(dataController, resourceManagerProvider, workerInvoker);
const jobExecutionRoutes = new JobExecutionRoutes(dataController, workerInvoker);

const routes = new McmaApiRouteCollection().addRoutes(jobRoutes).addRoutes(jobExecutionRoutes);

const middleware: McmaApiMiddleware[] = [];

if (process.env.MCMA_API_KEY_SECURITY_CONFIG_SECRET_ID) {
    const securityMiddleware = new McmaApiKeySecurityMiddleware({ secretsProvider });
    middleware.push(securityMiddleware);
}

const restController = new ApiGatewayApiController({
    routes,
    loggerProvider,
    middleware
});

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
    console.log(JSON.stringify(event, null, 2));
    console.log(JSON.stringify(context, null, 2));

    const logger = loggerProvider.get(context.awsRequestId);
    try {
        logger.functionStart(context.awsRequestId);
        logger.debug(event);
        logger.debug(context);

        return await restController.handleRequest(event, context);
    } finally {
        logger.functionEnd(context.awsRequestId);
    }
}
