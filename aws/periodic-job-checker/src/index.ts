import { Context, ScheduledEvent } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk-core";
import { v4 as uuidv4 } from "uuid";

import { Job, JobStatus, McmaTracker, ProblemDetail } from "@mcma/core";
import { AwsCloudWatchLoggerProvider } from "@mcma/aws-logger";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";

import { DataController } from "@local/job-processor";

const { LogGroupName, TableName, PublicUrl, CloudWatchEventRule, DefaultJobTimeoutInMinutes, WorkerFunctionId } = process.env;

const AWS = AWSXRay.captureAWS(require("aws-sdk"));

const cloudWatchEvents = new AWS.CloudWatchEvents();
const loggerProvider = new AwsCloudWatchLoggerProvider("job-processor-periodic-job-checker", LogGroupName, new AWS.CloudWatchLogs());
const workerInvoker = new LambdaWorkerInvoker(new AWS.Lambda());

const dataController = new DataController(TableName, PublicUrl, false, new AWS.DynamoDB());

export async function handler(event: ScheduledEvent, context: Context) {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Periodic Job Checker - " + new Date().toUTCString()
    });

    const logger = loggerProvider.get(context.awsRequestId, tracker);
    try {
        await cloudWatchEvents.disableRule({ Name: CloudWatchEventRule }).promise();

        const newJobs = await dataController.queryJobs({ status: JobStatus.New });
        const pendingJobs = await dataController.queryJobs({ status: JobStatus.Pending });
        const assignedJobs = await dataController.queryJobs({ status: JobStatus.Assigned });
        const queuedJobs = await dataController.queryJobs({ status: JobStatus.Queued });
        const scheduledJobs = await dataController.queryJobs({ status: JobStatus.Scheduled });
        const runningJobs = await dataController.queryJobs({ status: JobStatus.Running });

        const jobs =
            newJobs.results
                   .concat(pendingJobs.results)
                   .concat(assignedJobs.results)
                   .concat(queuedJobs.results)
                   .concat(scheduledJobs.results)
                   .concat(runningJobs.results);

        logger.info(`Found ${jobs.length} active jobs`);

        let activeJobs = 0;
        let failedJobsCount = 0;
        const now = new Date();

        for (const job of jobs) {
            let deadlinePassed = false;
            let timeoutPassed = false;

            let defaultTimeout = Number.parseInt(DefaultJobTimeoutInMinutes);

            if (job.deadline) {
                defaultTimeout = undefined;
                if (job.deadline < now) {
                    deadlinePassed = true;
                }
            }

            const timeout = job.timeout ?? defaultTimeout;
            if (timeout) {
                const [jobExecution] = (await dataController.getExecutions(job.id)).results;

                const startDate = jobExecution?.actualStartDate ?? jobExecution?.dateCreated ?? job.dateCreated;

                const timePassedInMinutes = (now.getTime() - startDate.getTime()) / 60000;

                if (timePassedInMinutes > timeout) {
                    timeoutPassed = true;
                }
            }

            if (deadlinePassed) {
                await failJob(job, new ProblemDetail({
                    type: "uri://mcma.ebu.ch/rfc7807/job-processor/job-deadline-passed",
                    title: "Job failed to complete before deadline",
                    detail: `Job missed deadline of ${job.deadline.toISOString()}`,
                }));
                failedJobsCount++;
            } else if (timeoutPassed) {
                await failJob(job, new ProblemDetail({
                    type: "uri://mcma.ebu.ch/rfc7807/job-processor/job-timeout-passed",
                    title: "Job failed to complete before timeout limit",
                    detail: `Job timed out after ${timeout} minutes`,
                }));
                failedJobsCount++;
            } else {
                activeJobs++;
            }
        }

        logger.info(`Failed ${failedJobsCount} due to deadline or timeout constraints`);

        if (activeJobs) {
            logger.info(`There are ${activeJobs} active jobs remaining`);
            await cloudWatchEvents.enableRule({ Name: CloudWatchEventRule }).promise();
        }
    } catch (error) {
        logger.error(error?.toString());
        throw error;
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}

async function failJob(job: Job, error: ProblemDetail) {
    await workerInvoker.invoke(WorkerFunctionId, {
        operationName: "FailJob",
        input: {
            jobId: job.id,
            error: error,
        },
        tracker: job.tracker,
    });
}
