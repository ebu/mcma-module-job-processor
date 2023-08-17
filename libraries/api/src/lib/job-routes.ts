import { v4 as uuidv4 } from "uuid";

import { getPublicUrl, HttpStatusCode, McmaApiRequestContext, McmaApiRouteCollection, } from "@mcma/api";
import { Job, JobProfile, JobStatus, McmaTracker } from "@mcma/core";
import { ResourceManagerProvider } from "@mcma/client";
import { getWorkerFunctionId, WorkerInvoker } from "@mcma/worker-invoker";

import { DataController } from "@local/data";

import { buildQueryParameters } from "./queries";

export class JobRoutes extends McmaApiRouteCollection {
    constructor(private dataController: DataController, private resourceManagerProvider: ResourceManagerProvider, private workerInvoker: WorkerInvoker) {
        super();

        this.addRoute("GET", "/jobs", reqCtx => this.queryJobs(reqCtx));
        this.addRoute("POST", "/jobs", reqCtx => this.addJob(reqCtx));
        this.addRoute("GET", "/jobs/{jobId}", reqCtx => this.getJob(reqCtx));
        this.addRoute("DELETE", "/jobs/{jobId}", reqCtx => this.deleteJob(reqCtx));
        this.addRoute("POST", "/jobs/{jobId}/cancel", reqCtx => this.cancelJob(reqCtx));
        this.addRoute("POST", "/jobs/{jobId}/restart", reqCtx => this.restartJob(reqCtx));
    }

    async queryJobs(requestContext: McmaApiRequestContext) {
        const queryStringParameters = requestContext.request.queryStringParameters;
        const queryParameters = buildQueryParameters(queryStringParameters, 100);

        const jobs = await this.dataController.queryJobs(queryParameters, queryStringParameters.pageStartToken);

        requestContext.setResponseBody(jobs);
    }

    async addJob(requestContext: McmaApiRequestContext) {
        let job = requestContext.getRequestBody<Job>();

        job.status = JobStatus.New;
        if (!job.tracker) {
            let label = job["@type"];

            try {
                const resourceManager = this.resourceManagerProvider.get(requestContext.configVariables);
                const jobProfile = await resourceManager.get<JobProfile>(job.jobProfileId);
                label += " with JobProfile " + jobProfile.name;
            } catch (error) {
                requestContext.getLogger().error(error);
                label += " with unknown JobProfile";
            }

            job.tracker = new McmaTracker({ id: uuidv4(), label });
        }

        job = await this.dataController.addJob(job);

        requestContext.setResponseBody(job);

        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "StartJob",
            input: {
                jobId: job.id
            },
            tracker: job.tracker,
        });
    }

    async getJob(requestContext: McmaApiRequestContext) {
        const { jobId } = requestContext.request.pathVariables;

        const job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);

        if (!job) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        requestContext.setResponseBody(job);
    }

    async deleteJob(requestContext: McmaApiRequestContext) {
        const { jobId } = requestContext.request.pathVariables;

        const job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);

        if (!job) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        if (job.status !== JobStatus.Completed &&
            job.status !== JobStatus.Failed &&
            job.status !== JobStatus.Canceled) {
            requestContext.setResponseError(HttpStatusCode.Conflict, `Cannot delete job while is non final state (${job.status})`);
            return;
        }

        requestContext.setResponseStatusCode(HttpStatusCode.Accepted);

        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "DeleteJob",
            input: {
                jobId: job.id
            },
            tracker: job.tracker,
        });
    }

    async cancelJob(requestContext: McmaApiRequestContext) {
        const { jobId } = requestContext.request.pathVariables;

        const job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);

        if (!job) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        if (job.status === JobStatus.Completed ||
            job.status === JobStatus.Failed ||
            job.status === JobStatus.Canceled) {
            requestContext.setResponseError(HttpStatusCode.Conflict, `Cannot cancel job when already finished`);
            return;
        }

        requestContext.setResponseStatusCode(HttpStatusCode.Accepted);

        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "CancelJob",
            input: {
                jobId: job.id
            },
            tracker: job.tracker,
        });
    }

    async restartJob(requestContext: McmaApiRequestContext) {
        const { jobId } = requestContext.request.pathVariables;

        const job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);

        if (!job) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        if (job.deadline && job.deadline < new Date()) {
            requestContext.setResponseError(HttpStatusCode.Conflict, `Cannot restart job when deadline is in the past (${job.deadline.toISOString()})`);
            return;
        }

        requestContext.setResponseStatusCode(HttpStatusCode.Accepted);

        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "RestartJob",
            input: {
                jobId: job.id
            },
            tracker: job.tracker,
        });
    }
}
