import { LoggerProvider } from "@mcma/core";
import { AuthProvider, ResourceManagerProvider } from "@mcma/client";
import { ProviderCollection, Worker } from "@mcma/worker";

import { cancelJob, deleteJob, failJob, processNotification, restartJob, startJob } from "./operations";

export function buildWorker(authProvider: AuthProvider, loggerProvider: LoggerProvider, resourceManagerProvider: ResourceManagerProvider) {
    const providerCollection = new ProviderCollection({
        authProvider,
        loggerProvider,
        resourceManagerProvider
    });

    return new Worker(providerCollection)
        .addOperation("CancelJob", cancelJob)
        .addOperation("DeleteJob", deleteJob)
        .addOperation("FailJob", failJob)
        .addOperation("ProcessNotification", processNotification)
        .addOperation("RestartJob", restartJob)
        .addOperation("StartJob", startJob);
}
