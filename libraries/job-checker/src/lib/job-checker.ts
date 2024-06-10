import { Job, JobStatus, Logger, ProblemDetail } from "@mcma/core";

import { DataController } from "@local/data";
import { getWorkerFunctionId, WorkerInvoker } from "@mcma/worker-invoker";

const { DEFAULT_JOB_TIMEOUT_IN_MINUTES } = process.env;

export class JobChecker {
    constructor(
        private logger: Logger,
        private dataController: DataController,
        private workerInvoker: WorkerInvoker,
        private requestId: string,
    ) {
    }

    async run() {
        const dbTable = await this.dataController.getDbTable();
        const mutex = dbTable.createMutex({
            name: "job-processor-job-checker",
            holder: this.requestId,
            logger: this.logger,
        });

        const locked = await mutex.tryLock();
        if (!locked) {
            return;
        }

        try {
            const newJobs = await this.dataController.queryJobs({ status: JobStatus.New });
            const pendingJobs = await this.dataController.queryJobs({ status: JobStatus.Pending });
            const assignedJobs = await this.dataController.queryJobs({ status: JobStatus.Assigned });
            const queuedJobs = await this.dataController.queryJobs({ status: JobStatus.Queued });
            const scheduledJobs = await this.dataController.queryJobs({ status: JobStatus.Scheduled });
            const runningJobs = await this.dataController.queryJobs({ status: JobStatus.Running });

            const jobs =
                newJobs.results
                    .concat(pendingJobs.results)
                    .concat(assignedJobs.results)
                    .concat(queuedJobs.results)
                    .concat(scheduledJobs.results)
                    .concat(runningJobs.results);

            this.logger.info(`Found ${jobs.length} active jobs`);

            let activeJobs = 0;
            let failedJobsCount = 0;
            const now = new Date();

            for (const job of jobs) {
                let deadlinePassed = false;
                let timeoutPassed = false;

                let defaultTimeout = Number.parseInt(DEFAULT_JOB_TIMEOUT_IN_MINUTES);

                if (job.deadline) {
                    defaultTimeout = undefined;
                    if (job.deadline < now) {
                        deadlinePassed = true;
                    }
                }

                const timeout = job.timeout ?? defaultTimeout;
                if (timeout) {
                    const [jobExecution] = (await this.dataController.getExecutions(job.id)).results;

                    const startDate = jobExecution?.actualStartDate ?? jobExecution?.dateCreated ?? job.dateCreated;

                    const timePassedInMinutes = (now.getTime() - startDate.getTime()) / 60000;

                    if (timePassedInMinutes > timeout) {
                        timeoutPassed = true;
                    }
                }

                if (deadlinePassed) {
                    await this.failJob(job, new ProblemDetail({
                        type: "uri://mcma.ebu.ch/rfc7807/job-processor/job-deadline-passed",
                        title: "Job failed to complete before deadline",
                        detail: `Job missed deadline of ${job.deadline.toISOString()}`,
                    }));
                    failedJobsCount++;
                } else if (timeoutPassed) {
                    await this.failJob(job, new ProblemDetail({
                        type: "uri://mcma.ebu.ch/rfc7807/job-processor/job-timeout-passed",
                        title: "Job failed to complete before timeout limit",
                        detail: `Job timed out after ${timeout} minutes`,
                    }));
                    failedJobsCount++;
                } else {
                    activeJobs++;
                }
            }

            this.logger.info(`Failed ${failedJobsCount} due to deadline or timeout constraints`);

            if (activeJobs) {
                this.logger.info(`There are ${activeJobs} active jobs remaining`);
            }
        } catch (error) {
            await mutex.unlock();
        }
    }

    async failJob(job: Job, error: ProblemDetail) {
        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "FailJob",
            input: {
                jobId: job.id,
                error: error,
            },
            tracker: job.tracker,
        });
    }
}
