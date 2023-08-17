import { Job, JobExecution, } from "@mcma/core";
import { DocumentDatabaseTableProvider, QueryResults } from "@mcma/data";

import { DataController } from "@local/data";

import { JobResourceQueryParameters, buildQuery } from "./queries";

export class AzureDataController extends DataController {

    constructor(tableName: string, publicUrl: string, dbTableProvider: DocumentDatabaseTableProvider) {
        super(tableName, publicUrl, dbTableProvider);
    }

    async queryJobs(queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<Job>> {
        await this.init();

        queryParameters.partitionKey = "/jobs";

        return await this.dbTable.query<Job>(buildQuery<Job>(queryParameters, pageStartToken));
    }

    async queryExecutions(jobId: string, queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<JobExecution>> {
        await this.init();

        const jobPath = this.extractPath(jobId);
        queryParameters.partitionKey = `${jobPath}/executions`;

        return await this.dbTable.query<JobExecution>(buildQuery<JobExecution>(queryParameters, pageStartToken));
    }
}
