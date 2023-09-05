import { Job, JobStatus, Logger } from "@mcma/core";
import { getWorkerFunctionId, WorkerInvoker } from "@mcma/worker-invoker";

import { DataController } from "@local/data";

const { JOB_RETENTION_PERIOD_IN_DAYS } = process.env;

export class JobCleanup {
    constructor(
        private logger: Logger,
        private dataController: DataController,
        private workerInvoker: WorkerInvoker
    ) {
    }

    async run() {
        this.logger.info(`Job Retention Period set to ${JOB_RETENTION_PERIOD_IN_DAYS} days`);

        if (Number.parseInt(JOB_RETENTION_PERIOD_IN_DAYS) <= 0) {
            this.logger.info("Exiting");
            return;
        }

        const retentionDateLimit = new Date(Date.now() - Number.parseInt(JOB_RETENTION_PERIOD_IN_DAYS) * 24 * 3600 * 1000);

        const completedJobs = await this.dataController.queryJobs({ status: JobStatus.Completed, to: retentionDateLimit });
        const failedJobs = await this.dataController.queryJobs({ status: JobStatus.Failed, to: retentionDateLimit });
        const canceledJobs = await this.dataController.queryJobs({ status: JobStatus.Canceled, to: retentionDateLimit });

        const jobs =
            completedJobs.results
                .concat(failedJobs.results)
                .concat(canceledJobs.results);

        this.logger.info(`Deleting ${jobs.length} jobs older than ${retentionDateLimit.toISOString()}`);

        for (const job of jobs) {
            await this.deleteJob(job);
        }
    }

    private async deleteJob(job: Job) {
        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "DeleteJob",
            input: {
                jobId: job.id,
            },
            tracker: job.tracker,
        });
    }
}
