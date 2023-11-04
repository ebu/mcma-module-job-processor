import { Context, ScheduledEvent } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { CloudWatchEventsClient } from "@aws-sdk/client-cloudwatch-events";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { v4 as uuidv4 } from "uuid";

import { McmaTracker } from "@mcma/core";
import { getTableName } from "@mcma/data";
import { getPublicUrl } from "@mcma/api";
import { AwsCloudWatchLoggerProvider, getLogGroupName } from "@mcma/aws-logger";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";
import { disableEventRule, enableEventRule } from "@mcma/aws-cloudwatch-events";

import { AwsDataController, buildDbTableProvider } from "@local/data-aws";
import { JobChecker } from "@local/job-checker";

const { CLOUD_WATCH_EVENT_RULE } = process.env;

const cloudWatchEventsClient = AWSXRay.captureAWSv3Client(new CloudWatchEventsClient({}));
const cloudWatchLogsClient = AWSXRay.captureAWSv3Client(new CloudWatchLogsClient({}));
const dynamoDBClient = AWSXRay.captureAWSv3Client(new DynamoDBClient({}));
const lambdaClient = AWSXRay.captureAWSv3Client(new LambdaClient({}));

const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-job-checker", getLogGroupName(), cloudWatchLogsClient);
const workerInvoker = new LambdaWorkerInvoker(lambdaClient);

const dataController = new AwsDataController(getTableName(), getPublicUrl(), buildDbTableProvider(false, dynamoDBClient));

export async function handler(event: ScheduledEvent, context: Context) {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Job Checker - " + new Date().toUTCString()
    });

    const logger = await loggerProvider.get(context.awsRequestId, tracker);
    try {
        logger.functionStart(context.awsRequestId);

        const jobChecker = new JobChecker(
            logger,
            dataController,
            {
                enable: async () => { await enableEventRule(CLOUD_WATCH_EVENT_RULE, await dataController.getDbTable(), cloudWatchEventsClient, context.awsRequestId, logger); },
                disable: async () => { await disableEventRule(CLOUD_WATCH_EVENT_RULE, await dataController.getDbTable(), cloudWatchEventsClient, context.awsRequestId, logger); }
            },
            workerInvoker
        );

        await jobChecker.run();
    } catch (error) {
        logger.error(error);
        throw error;
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}
