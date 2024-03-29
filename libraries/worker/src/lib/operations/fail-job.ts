import { Job, JobStatus, McmaException } from "@mcma/core";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { logJobEvent } from "../utils";
import { WorkerContext } from "../worker-context";

export async function failJob(providers: ProviderCollection, workerRequest: WorkerRequest, context: WorkerContext) {
    const { jobId, error } = workerRequest.input;

    const logger = workerRequest.logger;
    const resourceManager = providers.resourceManagerProvider.get();

    const dataController = context.dataController;
    const mutex = await dataController.createMutex(jobId, context.requestId, logger);

    let job: Job;

    await mutex.lock();
    try {
        job = await dataController.getJob(jobId);
        if (!job) {
            throw new McmaException(`Job with id '${jobId}' not found`);
        }

        if (job.status === JobStatus.Completed || job.status === JobStatus.Failed || job.status === JobStatus.Canceled) {
            return;
        }

        const [jobExecution] = (await dataController.getExecutions(jobId)).results;
        if (jobExecution) {
            if (jobExecution.jobAssignmentId) {
                try {
                    logger.info(`Canceling job assignment '${jobExecution.jobAssignmentId}'`);
                    const client = await resourceManager.getResourceEndpointClient(jobExecution.jobAssignmentId);
                    await client.post(undefined, `${jobExecution.jobAssignmentId}/cancel`);
                } catch (error) {
                    logger.warn(`Canceling job assignment '${jobExecution.jobAssignmentId} failed`);
                    logger.warn(error);
                }
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

            jobExecution.status = JobStatus.Failed;
            jobExecution.error = error;
            await dataController.updateExecution(jobExecution);
        }

        job.status = JobStatus.Failed;
        job.error = error;
        await dataController.updateJob(job);

        await logJobEvent(logger, resourceManager, job, jobExecution);
    } finally {
        await mutex.unlock();
    }

    await resourceManager.sendNotification(job);
}
