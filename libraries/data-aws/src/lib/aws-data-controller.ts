import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { Job, JobExecution } from "@mcma/core";
import { DocumentDatabaseTableProvider, QueryResults } from "@mcma/data";
import { DynamoDbTableOptions, DynamoDbTableProvider } from "@mcma/aws-dynamodb";

import { DataController, JobResourceQueryParameters } from "@local/data";

import { createJobResourceQuery } from "./custom-queries";

function getDynamoDbOptions(consistentRead: boolean): DynamoDbTableOptions {
    return {
        topLevelAttributeMappings: {
            resource_status: (partitionKey, sortKey, resource) => `${partitionKey}-${resource.status}`,
            resource_created: (partitionKey, sortKey, resource) => resource.dateCreated.getTime()
        },
        customQueryRegistry: {
            createJobResourceQuery
        },
        consistentGet: consistentRead,
        consistentQuery: consistentRead
    };
}

export function buildDbTableProvider(consistentRead: boolean, dynamoDBClient: DynamoDBClient): DocumentDatabaseTableProvider {
    return new DynamoDbTableProvider(getDynamoDbOptions(consistentRead), dynamoDBClient);
}

export class AwsDataController extends DataController {

    constructor(tableName: string, publicUrl: string, dbTableProvider: DocumentDatabaseTableProvider) {
        super(tableName, publicUrl, dbTableProvider);
    }

    async queryJobs(queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<Job>> {
        await this.init();

        queryParameters.partitionKey = "/jobs";

        return await this.dbTable.customQuery<Job, JobResourceQueryParameters>({
            name: createJobResourceQuery.name,
            parameters: queryParameters,
            pageStartToken
        });
    }

    async queryExecutions(jobId: string, queryParameters: JobResourceQueryParameters, pageStartToken?: string): Promise<QueryResults<JobExecution>> {
        await this.init();

        const jobPath = this.extractPath(jobId);
        queryParameters.partitionKey = `${jobPath}/executions`;

        return await this.dbTable.customQuery<JobExecution, JobResourceQueryParameters>({
            name: createJobResourceQuery.name,
            parameters: queryParameters,
            pageStartToken
        });
    }
}
