import { McmaException } from "@mcma/core";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { DataController } from "@local/job-processor";

export async function deleteJob(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string, dataController: DataController }) {
    const jobId = workerRequest.input.jobId;

    const logger = workerRequest.logger;
    const resourceManager = providers.resourceManagerProvider.get();

    const dataController = context.dataController;
    const mutex = await dataController.createMutex(jobId, context.awsRequestId, logger);

    await mutex.lock();
    try {
        const job = await dataController.getJob(jobId);
        if (!job) {
            throw new McmaException(`Job with id '${jobId}' not found`);
        }

        const jobExecutions = await dataController.getExecutions(jobId);

        for (const jobExecution of jobExecutions.results) {
            if (jobExecution.jobAssignmentId) {
                try {
                    logger.info(`Deleting job assignment '${jobExecution.jobAssignmentId}'`);
                    await resourceManager.delete(jobExecution.jobAssignmentId);
                } catch (error) {
                    logger.warn(`Failed to delete job assignment ${jobExecution.jobAssignmentId}`);
                    logger.warn(error);
                }
            }
            await dataController.deleteExecution(jobExecution.id);
        }

        await dataController.deleteJob(job.id);
    } finally {
        await mutex.unlock();
    }
}
