import { Job, JobStatus, Logger, McmaException } from "@mcma/core";
import { AuthProvider, ResourceManager } from "@mcma/client";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { DataController } from "@local/data";

import { logJobEvent } from "../utils";
import { WorkerContext } from "../worker-context";

export async function cancelJob(providers: ProviderCollection, workerRequest: WorkerRequest, context: WorkerContext) {
    const jobId = workerRequest.input.jobId;

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

        job = await cancelExecution(job, dataController, resourceManager, providers.authProvider, logger);
    } finally {
        await mutex.unlock();
    }

    await resourceManager.sendNotification(job);
}

export async function cancelExecution(job: Job, dataController: DataController, resourceManager: ResourceManager, authProvider: AuthProvider, logger: Logger): Promise<Job> {
    if (job.status === JobStatus.Completed || job.status === JobStatus.Failed || job.status === JobStatus.Canceled) {
        return job;
    }

    const [jobExecution] = (await dataController.getExecutions(job.id)).results;
    if (jobExecution) {
        if (jobExecution.jobAssignmentId) {
            try {
                logger.info(`Canceling job assignment '${jobExecution.jobAssignmentId}'`);
                const client = await resourceManager.getResourceEndpointClient(jobExecution.jobAssignmentId);
                await client.post(undefined, `${jobExecution.jobAssignmentId}/cancel`);
            } catch (error) {
                logger.warn(`Canceling job assignment '${jobExecution.jobAssignmentId}' failed`);
                logger.warn(error);
            }
        }

        jobExecution.status = JobStatus.Canceled;
        await dataController.updateExecution(jobExecution);
    }

    job.status = JobStatus.Canceled;
    await dataController.updateJob(job);

    await logJobEvent(logger, resourceManager, job, jobExecution);

    return job;
}
