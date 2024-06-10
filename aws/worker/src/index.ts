import { Context } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { AwsSecretsManagerSecretsProvider } from "@mcma/aws-secrets-manager";
import { AuthProvider, mcmaApiKeyAuth, ResourceManagerProvider } from "@mcma/client";
import { WorkerRequest, WorkerRequestProperties } from "@mcma/worker";
import { AwsCloudWatchLoggerProvider, getLogGroupName } from "@mcma/aws-logger";
import { awsV4Auth } from "@mcma/aws-client";
import { getTableName } from "@mcma/data";
import { getPublicUrl } from "@mcma/api";

import { AwsDataController, buildDbTableProvider } from "@local/data-aws";

import { buildWorker, WorkerContext } from "@local/worker";

const cloudWatchLogsClient = AWSXRay.captureAWSv3Client(new CloudWatchLogsClient({}));
const dynamoDBClient = AWSXRay.captureAWSv3Client(new DynamoDBClient({}));
const secretsManagerClient = AWSXRay.captureAWSv3Client(new SecretsManagerClient({}));

const secretsProvider = new AwsSecretsManagerSecretsProvider({ client: secretsManagerClient });
const authProvider = new AuthProvider().add(awsV4Auth()).add(mcmaApiKeyAuth({ secretsProvider }));
const resourceManagerProvider = new ResourceManagerProvider(authProvider);
const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-worker", getLogGroupName(), cloudWatchLogsClient);

const dataController = new AwsDataController(getTableName(), getPublicUrl(), buildDbTableProvider(true, dynamoDBClient));

const worker = buildWorker(authProvider, loggerProvider, resourceManagerProvider);

export async function handler(event: WorkerRequestProperties, context: Context) {
    const logger = await loggerProvider.get(context.awsRequestId, event.tracker);

    try {
        logger.functionStart(context.awsRequestId);
        logger.debug(event);
        logger.debug(context);

        const workerContext: WorkerContext = {
            requestId: context.awsRequestId,
            dataController,
        };

        await worker.doWork(new WorkerRequest(event, logger), workerContext);
    } catch (error) {
        logger.error("Error occurred when handling operation '" + event.operationName + "'");
        logger.error(error);
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}
