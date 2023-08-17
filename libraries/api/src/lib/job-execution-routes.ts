import { getPublicUrl, HttpStatusCode, McmaApiRequestContext, McmaApiRouteCollection } from "@mcma/api";
import { QuerySortOrder } from "@mcma/data";
import { getWorkerFunctionId, WorkerInvoker } from "@mcma/worker-invoker";

import { DataController } from "@local/data";
import { buildQueryParameters } from "./queries";

export class JobExecutionRoutes extends McmaApiRouteCollection {
    constructor(private dataController: DataController, private workerInvoker: WorkerInvoker) {
        super();

        this.addRoute("GET", "/jobs/{jobId}/executions", reqCtx => this.queryExecutions(reqCtx));
        this.addRoute("GET", "/jobs/{jobId}/executions/{executionId}", reqCtx => this.getExecution(reqCtx));
        this.addRoute("POST", "/jobs/{jobId}/executions/{executionId}/notifications", reqCtx => this.processNotification(reqCtx));
    }

    async queryExecutions(requestContext: McmaApiRequestContext) {
        const { jobId } = requestContext.request.pathVariables;

        let job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);
        if (!job) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        const queryStringParameters = requestContext.request.queryStringParameters;
        const queryParameters = buildQueryParameters(queryStringParameters);

        const executions = await this.dataController.queryExecutions(job.id, queryParameters, queryStringParameters.pageStartToken);

        requestContext.setResponseBody(executions);
    }

    async getExecution(requestContext: McmaApiRequestContext) {
        const { jobId, executionId } = requestContext.request.pathVariables;

        let execution;

        if (executionId === "latest") {
            execution = (await this.dataController.queryExecutions(`${getPublicUrl()}/jobs/${jobId}`, { pageSize: 1, sortOrder: QuerySortOrder.Descending })).results[0];
        } else {
            execution = await this.dataController.getExecution(`${getPublicUrl()}/jobs/${jobId}/executions/${executionId}`);
        }

        if (!execution) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        requestContext.setResponseBody(execution);
    }

    async processNotification(requestContext: McmaApiRequestContext) {
        const { jobId, executionId } = requestContext.request.pathVariables;

        let job = await this.dataController.getJob(`${getPublicUrl()}/jobs/${jobId}`);
        let jobExecution = await this.dataController.getExecution(`${getPublicUrl()}/jobs/${jobId}/executions/${executionId}`);

        if (!job || !jobExecution) {
            requestContext.setResponseResourceNotFound();
            return;
        }

        let notification = requestContext.getRequestBody();
        if (!notification) {
            requestContext.setResponseBadRequestDueToMissingBody();
            return;
        }

        if (jobExecution.jobAssignmentId && jobExecution.jobAssignmentId !== notification.source) {
            requestContext.setResponseError(HttpStatusCode.BadRequest, "Unexpected notification from '" + notification.source + "'.");
            return;
        }

        requestContext.setResponseStatusCode(HttpStatusCode.Accepted);

        await this.workerInvoker.invoke(getWorkerFunctionId(), {
            operationName: "ProcessNotification",
            input: {
                jobId: job.id,
                jobExecutionId: jobExecution.id,
                notification,
            },
            tracker: job.tracker,
        });
    }
}
