import { Context, AzureFunction } from "@azure/functions";
import { v4 as uuidv4 } from "uuid";

import { getPublicUrl } from "@mcma/api";
import { McmaTracker } from "@mcma/core";
import { getTableName } from "@mcma/data";
import { CosmosDbTableProvider, fillOptionsFromConfigVariables } from "@mcma/azure-cosmos-db";
import { AppInsightsLoggerProvider } from "@mcma/azure-logger";
import { QueueWorkerInvoker } from "@mcma/azure-queue-worker-invoker";

import { AzureDataController } from "@local/data-azure";
import { JobChecker } from "@local/job-checker";

const loggerProvider = new AppInsightsLoggerProvider("job-processor-job-checker");
const dbTableProvider = new CosmosDbTableProvider(fillOptionsFromConfigVariables());

const workerInvoker = new QueueWorkerInvoker();

const dataController = new AzureDataController(getTableName(), getPublicUrl(), dbTableProvider);

export const handler: AzureFunction = async (context: Context, timer: any) => {
    const tracker = new McmaTracker({
        id: uuidv4(),
        label: "Job Checker - " + new Date().toUTCString()
    });

    const logger = await loggerProvider.get(context.invocationId, tracker);
    try {
        logger.functionStart(context.invocationId);
        logger.debug(context);
        logger.debug(timer);

        const jobChecker = new JobChecker(
            logger,
            dataController,
            workerInvoker,
            context.invocationId,
        );

        await jobChecker.run();
    } catch (error) {
        logger.error(error);
        throw error;
    } finally {
        logger.functionEnd(context.invocationId);
        loggerProvider.flush();
    }
};
