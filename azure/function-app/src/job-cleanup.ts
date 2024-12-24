import { v4 as uuidv4 } from "uuid";

import { getPublicUrl } from "@mcma/api";

import { getTableName } from "@mcma/data";
import { CosmosDbTableProvider, fillOptionsFromConfigVariables } from "@mcma/azure-cosmos-db";
import { AppInsightsLoggerProvider } from "@mcma/azure-logger";
import { QueueWorkerInvoker } from "@mcma/azure-queue-worker-invoker";

import { AzureDataController } from "@local/data-azure";
import { JobCleanup } from "@local/job-cleanup";
import { McmaTracker } from "@mcma/core";
import { InvocationContext, Timer } from "@azure/functions";

const loggerProvider = new AppInsightsLoggerProvider("job-processor-job-cleanup");
const dbTableProvider = new CosmosDbTableProvider(fillOptionsFromConfigVariables());

const workerInvoker = new QueueWorkerInvoker();

const dataController = new AzureDataController(getTableName(), getPublicUrl(), dbTableProvider);

export async function jobCleanup(timer: Timer, context: InvocationContext) {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Job Cleanup - " + new Date().toUTCString()
    });

    const logger = await loggerProvider.get(context.invocationId, tracker);
    try {
        logger.functionStart(context.invocationId);
        logger.debug(context);
        logger.debug(timer);

        const jobCleanup = new JobCleanup(logger, dataController, workerInvoker);
        await jobCleanup.run();
    } catch (error) {
        logger.error(error);
        throw error;
    } finally {
        logger.functionEnd(context.invocationId);
        loggerProvider.flush();
    }
}
