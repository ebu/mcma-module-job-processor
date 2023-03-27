import { APIGatewayProxyEventV2, Context } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";

import { ConsoleLoggerProvider } from "@mcma/core";
import { getPublicUrl, McmaApiRouteCollection } from "@mcma/api";
import { AuthProvider, ResourceManagerProvider } from "@mcma/client";
import { getTableName } from "@mcma/data";
import { ApiGatewayApiController } from "@mcma/aws-api-gateway";
import { awsV4Auth } from "@mcma/aws-client";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";

import { DataController } from "@local/job-processor";
import { JobRoutes } from "./job-routes";
import { JobExecutionRoutes } from "./job-execution-routes";

const AWS = AWSXRay.captureAWS(require("aws-sdk"));

const authProvider = new AuthProvider().add(awsV4Auth(AWS));
const resourceManagerProvider = new ResourceManagerProvider(authProvider);

const loggerProvider = new ConsoleLoggerProvider("job-processor-api-handler");
const workerInvoker = new LambdaWorkerInvoker(new AWS.Lambda());

const dataController = new DataController(getTableName(), getPublicUrl(), false, new AWS.DynamoDB());
const jobRoutes = new JobRoutes(dataController, resourceManagerProvider, workerInvoker);
const jobExecutionRoutes = new JobExecutionRoutes(dataController, workerInvoker);

const routes = new McmaApiRouteCollection().addRoutes(jobRoutes).addRoutes(jobExecutionRoutes);

const restController = new ApiGatewayApiController(routes, loggerProvider);

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
