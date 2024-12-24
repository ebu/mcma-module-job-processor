import { HttpRequest, InvocationContext } from "@azure/functions";

import { McmaApiRouteCollection, McmaApiKeySecurityMiddleware, getPublicUrl } from "@mcma/api";
import { AuthProvider, ResourceManagerProvider, mcmaApiKeyAuth } from "@mcma/client";
import { getTableName } from "@mcma/data";
import { CosmosDbTableProvider, fillOptionsFromConfigVariables } from "@mcma/azure-cosmos-db";
import { AppInsightsLoggerProvider } from "@mcma/azure-logger";
import { AzureFunctionApiController } from "@mcma/azure-functions-api";
import { AzureKeyVaultSecretsProvider } from "@mcma/azure-key-vault";
import { QueueWorkerInvoker } from "@mcma/azure-queue-worker-invoker";

import { AzureDataController } from "@local/data-azure";

import { JobRoutes } from "@local/api";
import { JobExecutionRoutes } from "@local/api";

const loggerProvider = new AppInsightsLoggerProvider("job-processor-api-handler");
const dbTableProvider = new CosmosDbTableProvider(fillOptionsFromConfigVariables());
const secretsProvider = new AzureKeyVaultSecretsProvider();
const authProvider = new AuthProvider().add(mcmaApiKeyAuth({ secretsProvider }));
const resourceManagerProvider = new ResourceManagerProvider(authProvider);
const workerInvoker = new QueueWorkerInvoker();

const securityMiddleware = new McmaApiKeySecurityMiddleware({ secretsProvider });

const dataController = new AzureDataController(getTableName(), getPublicUrl(), dbTableProvider);
const jobRoutes = new JobRoutes(dataController, resourceManagerProvider, workerInvoker);
const jobExecutionRoutes = new JobExecutionRoutes(dataController, workerInvoker);

const routes = new McmaApiRouteCollection().addRoutes(jobRoutes).addRoutes(jobExecutionRoutes);

const restController =
    new AzureFunctionApiController(
        {
            routes,
            loggerProvider,
            middleware: [securityMiddleware],
        });

export async function apiHandler(request: HttpRequest, context: InvocationContext) {
    const logger = await loggerProvider.get(context.invocationId);

    try {
        logger.functionStart(context.invocationId);
        logger.debug(context);
        logger.debug(request);

        return await restController.handleRequest(request);
    } catch (error) {
        logger.error(error);
        throw error;
    } finally {
        logger.functionEnd(context.invocationId);
        loggerProvider.flush();
    }
}
