import { Context, ScheduledEvent } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { v4 as uuidv4 } from "uuid";

import { Job, JobStatus, McmaTracker } from "@mcma/core";
import { AwsCloudWatchLoggerProvider, getLogGroupName } from "@mcma/aws-logger";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";

import { DataController } from "@local/job-processor";
import { getTableName } from "@mcma/data";
import { getPublicUrl } from "@mcma/api";
import { getWorkerFunctionId } from "@mcma/worker-invoker";

const { JOB_RETENTION_PERIOD_IN_DAYS } = process.env;

const AWS = AWSXRay.captureAWS(require("aws-sdk"));

const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-periodic-job-cleanup", getLogGroupName(), new AWS.CloudWatchLogs());
const workerInvoker = new LambdaWorkerInvoker(new AWS.Lambda());

const dataController = new DataController(getTableName(), getPublicUrl(), false, new AWS.DynamoDB());

export async function handler(event: ScheduledEvent, context: Context) {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Periodic Job Cleanup - " + new Date().toUTCString()
    });

    const logger = loggerProvider.get(context.awsRequestId, tracker);
    try {
        logger.info(`Job Retention Period set to ${JOB_RETENTION_PERIOD_IN_DAYS} days`);

        if (Number.parseInt(JOB_RETENTION_PERIOD_IN_DAYS) <= 0) {
            logger.info("Exiting");
            return;
        }

        const retentionDateLimit = new Date(Date.now() - Number.parseInt(JOB_RETENTION_PERIOD_IN_DAYS) * 24 * 3600 * 1000);

        const completedJobs = await dataController.queryJobs({ status: JobStatus.Completed, to: retentionDateLimit });
        const failedJobs = await dataController.queryJobs({ status: JobStatus.Failed, to: retentionDateLimit });
        const canceledJobs = await dataController.queryJobs({ status: JobStatus.Canceled, to: retentionDateLimit });

        const jobs =
            completedJobs.results
                         .concat(failedJobs.results)
                         .concat(canceledJobs.results);

        logger.info(`Deleting ${jobs.length} jobs older than ${retentionDateLimit.toISOString()}`);

        for (const job of jobs) {
            await deleteJob(job);
        }
    } catch (error) {
        logger.error(error?.toString());
        throw error;
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}

async function deleteJob(job: Job) {
    await workerInvoker.invoke(getWorkerFunctionId(), {
        operationName: "DeleteJob",
        input: {
            jobId: job.id,
        },
        tracker: job.tracker,
    });
}
