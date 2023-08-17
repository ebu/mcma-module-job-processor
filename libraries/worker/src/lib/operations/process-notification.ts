import { Job, JobExecution, JobStatus, McmaException } from "@mcma/core";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { logJobEvent } from "../utils";
import { WorkerContext } from "../worker-context";

export async function processNotification(providers: ProviderCollection, workerRequest: WorkerRequest, context: WorkerContext) {
    const { jobId, jobExecutionId, notification } = workerRequest.input;

    const logger = workerRequest.logger;
    const resourceManager = providers.resourceManagerProvider.get();

    const dataController = context.dataController;
    const mutex = await dataController.createMutex(jobId, context.requestId, logger);

    let job: Job;
    let jobExecution: JobExecution;

    await mutex.lock();
    try {
        job = await dataController.getJob(jobId);
        if (!job) {
            throw new McmaException(`Job with id '${jobId}' not found`);
        }

        jobExecution = await dataController.getExecution(jobExecutionId);
        if (!jobExecution) {
            throw new McmaException(`JobExecution with id '${jobExecutionId}' not found`);
        }

        // not updating job if it already was marked as completed or failed.
        if (jobExecution.status === JobStatus.Completed || jobExecution.status === JobStatus.Failed || jobExecution.status === JobStatus.Canceled) {
            logger.warn(`Ignoring notification for job execution that would change state from ${jobExecution.status} to ${notification.content.status}: ${jobExecution.id}`);
            return;
        }

        if (jobExecution.status !== notification.content.status) {
            logger.info(`Job execution changed status from ${job.status} to ${notification.content.status}: ${job.id}`);

            switch (notification.content.status) {
                case JobStatus.Running:
                    if (!jobExecution.actualStartDate) {
                        jobExecution.actualStartDate = new Date();
                    }
                    break;
                case JobStatus.Failed:
                case JobStatus.Canceled:
                case JobStatus.Completed:
                    if (!jobExecution.actualStartDate) {
                        jobExecution.actualStartDate = new Date();
                    }
                    if (!jobExecution.actualEndDate) {
                        jobExecution.actualEndDate = new Date();
                    }

                    jobExecution.actualDuration = 0;

                    if (jobExecution.actualStartDate && jobExecution.actualEndDate) {
                        const startDate = jobExecution.actualStartDate.getTime();
                        const endDate = jobExecution.actualEndDate.getTime();
                        if (Number.isInteger(startDate) && Number.isInteger(endDate) && startDate < endDate) {
                            jobExecution.actualDuration = endDate - startDate;
                        }
                    }
                    break;
            }
        }

        jobExecution.status = notification.content.status;
        jobExecution.error = notification.content.error;
        jobExecution.progress = notification.content.progress;
        jobExecution.jobOutput = notification.content.jobOutput;

        await dataController.updateExecution(jobExecution);

        job.status = jobExecution.status;
        job.error = jobExecution.error;
        job.progress = jobExecution.progress;
        job.jobOutput = jobExecution.jobOutput;

        await dataController.updateJob(job);
    } finally {
        await mutex.unlock();
    }

    await logJobEvent(logger, resourceManager, job, jobExecution);

    await resourceManager.sendNotification(job);
}
