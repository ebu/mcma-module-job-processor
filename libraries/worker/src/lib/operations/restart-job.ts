import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { Job, McmaException } from "@mcma/core";
import { startExecution } from "./start-job";
import { cancelExecution } from "./cancel-job";
import { WorkerContext } from "../worker-context";

export async function restartJob(providers: ProviderCollection, workerRequest: WorkerRequest, context: WorkerContext) {
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

        job = await startExecution(job, resourceManager, providers.authProvider, logger, context);
    } finally {
        await mutex.unlock();
    }

    await resourceManager.sendNotification(job);
}
