import { Context, ScheduledEvent } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { v4 as uuidv4 } from "uuid";

import { McmaTracker } from "@mcma/core";
import { AwsCloudWatchLoggerProvider, getLogGroupName } from "@mcma/aws-logger";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";
import { getTableName } from "@mcma/data";
import { getPublicUrl } from "@mcma/api";

import { AwsDataController, buildDbTableProvider } from "@local/data-aws";
import { JobCleanup } from "@local/job-cleanup";

const cloudWatchLogsClient = AWSXRay.captureAWSv3Client(new CloudWatchLogsClient({}));
const dynamoDBClient = AWSXRay.captureAWSv3Client(new DynamoDBClient({}));
const lambdaClient = AWSXRay.captureAWSv3Client(new LambdaClient({}));

const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-job-cleanup", getLogGroupName(), cloudWatchLogsClient);
const workerInvoker = new LambdaWorkerInvoker(lambdaClient);

const dataController = new AwsDataController(getTableName(), getPublicUrl(), buildDbTableProvider(false, dynamoDBClient));

export async function handler(event: ScheduledEvent, context: Context) {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Job Cleanup - " + new Date().toUTCString()
    });

    const logger = await loggerProvider.get(context.awsRequestId, tracker);
    try {
        logger.functionStart(context.awsRequestId);

        const jobCleanup = new JobCleanup(logger, dataController, workerInvoker);
        await jobCleanup.run();
    } catch (error) {
        logger.error(error);
        throw error;
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}
