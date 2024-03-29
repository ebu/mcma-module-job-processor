import { v4 as uuidv4 } from "uuid";

import { Job, JobExecution, Logger } from "@mcma/core";
import { DocumentDatabaseMutex, DocumentDatabaseTable, DocumentDatabaseTableProvider, QueryResults, QuerySortOrder } from "@mcma/data";
import { JobResourceQueryParameters } from "./job-resource-query-parameters";

export abstract class DataController {
    protected dbTable: DocumentDatabaseTable;

    protected constructor(protected tableName: string, protected publicUrl: string, protected dbTableProvider: DocumentDatabaseTableProvider) {
    }

    protected async init() {
        if (!this.dbTable) {
            this.dbTable = await this.dbTableProvider.get(this.tableName);
        }
    }

    async getDbTable(): Promise<DocumentDatabaseTable> {
        await this.init();
        return this.dbTable;
    }

    abstract queryJobs(queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<Job>>;

    async getJob(jobId: string): Promise<Job> {
        await this.init();
        const jobPath = this.extractPath(jobId);
        return await this.dbTable.get(jobPath);
    }

    async addJob(job: Job): Promise<Job> {
        await this.init();
        const jobPath = `/jobs/${uuidv4()}`;
        job.id = this.publicUrl + jobPath;
        job.dateCreated = job.dateModified = new Date();
        return await this.dbTable.put(jobPath, job);
    }

    async updateJob(job: Job): Promise<Job> {
        await this.init();
        const jobPath = this.extractPath(job.id);
        job.dateModified = new Date();
        return await this.dbTable.put(jobPath, job);
    }

    async deleteJob(jobId: string): Promise<void> {
        await this.init();
        const jobPath = this.extractPath(jobId);
        await this.dbTable.delete(jobPath);
    }

    abstract queryExecutions(jobId: string, queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<JobExecution>>;

    async getExecutions(jobId: string): Promise<QueryResults<JobExecution>> {
        await this.init();
        const jobPath = this.extractPath(jobId);
        const jobExecutionsPath = jobPath + "/executions";

        return await this.dbTable.query({ path: jobExecutionsPath, sortOrder: QuerySortOrder.Descending });
    }

    async getExecution(jobExecutionId: string): Promise<JobExecution> {
        await this.init();
        const jobExecutionPath = this.extractPath(jobExecutionId);

        return await this.dbTable.get(jobExecutionPath);
    }

    async addExecution(jobId: string, jobExecution: JobExecution): Promise<JobExecution> {
        await this.init();
        const jobPath = this.extractPath(jobId);

        const executions = await this.getExecutions(jobId);
        const executionNumber = executions.results.length + 1;

        jobExecution.id = `${jobId}/executions/${executionNumber}`;
        jobExecution.dateCreated = jobExecution.dateModified = new Date();

        await this.dbTable.put(`${jobPath}/executions/${executionNumber}`, jobExecution);

        return jobExecution;
    }

    async updateExecution(jobExecution: JobExecution): Promise<JobExecution> {
        await this.init();
        const jobExecutionPath = this.extractPath(jobExecution.id);
        jobExecution.dateModified = new Date();
        await this.dbTable.put(jobExecutionPath, jobExecution);

        return jobExecution;
    }

    async deleteExecution(jobExecutionId: string) {
        await this.init();
        const jobExecutionPath = this.extractPath(jobExecutionId);

        return this.dbTable.delete(jobExecutionPath);
    }

    async createMutex(mutexName: string, mutexHolder: string, logger: Logger): Promise<DocumentDatabaseMutex> {
        await this.init();
        return this.dbTable.createMutex({
            name: mutexName,
            holder: mutexHolder,
            logger
        });
    }
    
    protected extractPath(id: string): string {
        const startIdx = id.indexOf("/jobs/");
        return id.substring(startIdx);
    }
}
