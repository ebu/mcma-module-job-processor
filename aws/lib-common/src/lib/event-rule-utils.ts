import { CloudWatchEvents } from "aws-sdk";
import { DocumentDatabaseTable } from "@mcma/data";
import { Logger, Utils } from "@mcma/core";

async function enableDisableRule(doEnable: boolean, ruleName: string, table: DocumentDatabaseTable, cloudWatchEvents: CloudWatchEvents, requestId: string, logger: Logger) {
    const mutex = table.createMutex({
        name: ruleName,
        holder: requestId,
        logger: logger,
    });

    await mutex.lock();
    try {
        let rule = await cloudWatchEvents.describeRule({ Name: ruleName }).promise();
        if (rule.State !== "DISABLED") {
            await cloudWatchEvents.disableRule({ Name: ruleName }).promise();
            await Utils.sleep(2500);
            rule = await cloudWatchEvents.describeRule({ Name: ruleName }).promise();
        }
        if (doEnable) {
            if (rule.State !== "ENABLED") {
                await cloudWatchEvents.enableRule({ Name: ruleName }).promise();
                await Utils.sleep(2500);
            }
        }
    } finally {
        await mutex.unlock();
    }
}

export async function enableEventRule(ruleName: string, table: DocumentDatabaseTable, cloudWatchEvents: CloudWatchEvents, requestId: string, logger: Logger) {
    await enableDisableRule(true, ruleName, table, cloudWatchEvents, requestId, logger);
}

export async function disableEventRule(ruleName: string, table: DocumentDatabaseTable, cloudWatchEvents: CloudWatchEvents, requestId: string, logger: Logger) {
    await enableDisableRule(false, ruleName, table, cloudWatchEvents, requestId, logger);
}
