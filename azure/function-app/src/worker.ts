import { InvocationContext } from "@azure/functions";
import { AuthProvider, mcmaApiKeyAuth, ResourceManagerProvider } from "@mcma/client";
import { WorkerRequest } from "@mcma/worker";
import { AppInsightsLoggerProvider } from "@mcma/azure-logger";
import { AzureKeyVaultSecretsProvider } from "@mcma/azure-key-vault";
import { getTableName } from "@mcma/data";
import { getPublicUrl } from "@mcma/api";
import { CosmosDbTableProvider, fillOptionsFromConfigVariables } from "@mcma/azure-cosmos-db";

import { AzureDataController } from "@local/data-azure";
import { buildWorker, WorkerContext } from "@local/worker";

const loggerProvider = new AppInsightsLoggerProvider("job-processor-worker");
const dbTableProvider = new CosmosDbTableProvider(fillOptionsFromConfigVariables());
const secretsProvider = new AzureKeyVaultSecretsProvider();
const authProvider = new AuthProvider().add(mcmaApiKeyAuth({ secretsProvider }));
const resourceManagerProvider = new ResourceManagerProvider(authProvider);

const dataController = new AzureDataController(getTableName(), getPublicUrl(), dbTableProvider);

const worker = buildWorker(authProvider, loggerProvider, resourceManagerProvider);

export async function workerQueueHandler(queueItem: unknown, context: InvocationContext) {
    const queueMessage = queueItem as any;
    const logger = await loggerProvider.get(context.invocationId, queueMessage.tracker);

    try {
        logger.functionStart(context.invocationId);
        logger.debug(context);
        logger.debug(queueMessage);

        const workerContext: WorkerContext = {
            requestId: context.invocationId,
            dataController,
        };

        await worker.doWork(new WorkerRequest(queueMessage, logger), workerContext);
    } catch (error) {
        logger.error(error.message);
        logger.error(error);
    } finally {
        logger.functionEnd(context.invocationId);
        loggerProvider.flush();
    }
}
