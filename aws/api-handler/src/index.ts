import { APIGatewayProxyEventV2, Context } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";

import { McmaApiRouteCollection } from "@mcma/api";
import { ApiGatewayApiController } from "@mcma/aws-api-gateway";
import { AwsCloudWatchLoggerProvider } from "@mcma/aws-logger";
import { AuthProvider, ResourceManagerProvider } from "@mcma/client";
import { awsV4Auth } from "@mcma/aws-client";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";

import { DataController } from "@local/job-processor";
import { JobRoutes } from "./job-routes";
import { JobExecutionRoutes } from "./job-execution-routes";

const { TableName, PublicUrl, LogGroupName } = process.env;

const AWS = AWSXRay.captureAWS(require("aws-sdk"));

const authProvider = new AuthProvider().add(awsV4Auth(AWS));
const resourceManagerProvider = new ResourceManagerProvider(authProvider);

const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-api-handler", LogGroupName, new AWS.CloudWatchLogs());
const workerInvoker = new LambdaWorkerInvoker(new AWS.Lambda());

const dataController = new DataController(TableName, PublicUrl, false, new AWS.DynamoDB());
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

        console.log("LoggerProvider.flush - START - " + new Date().toISOString());
        const t1 = Date.now();
        await loggerProvider.flush(Date.now() + context.getRemainingTimeInMillis() - 5000);
        const t2 = Date.now();
        console.log("LoggerProvider.flush - END   - " + new Date().toISOString() + " - flush took " + (t2 - t1) + " ms");
    }
}
