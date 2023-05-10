import { JobStatus } from "@mcma/core";
import { CustomQuery, Document, QuerySortOrder } from "@mcma/data";
import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";

export type JobResourceQueryParameters = {
    partitionKey?: string;
    status?: JobStatus;
    from?: Date;
    to?: Date;
    sortOrder?: QuerySortOrder;
    pageSize?: number;
}

export function createJobResourceQuery(customQuery: CustomQuery<Document, JobResourceQueryParameters>): QueryCommandInput {
    let { partitionKey, status, from, to, sortOrder, pageSize } = customQuery.parameters;
    if (pageSize === null) {
        pageSize = undefined;
    }

    const index = status ? "ResourceStatusIndex" : "ResourceCreatedIndex";
    const partitionKeyField = status ? "resource_status" : "resource_pkey";
    const partitionKeyValue = status ? `${partitionKey}-${status}` : partitionKey;
    let keyConditionExpression = `${partitionKeyField} = :pkey`;
    const expressionAttributeValues: any = {
        ":pkey": partitionKeyValue
    };

    if ((from !== undefined && from !== null) &&
        (to !== undefined && to !== null)) {
        keyConditionExpression += " and resource_created BETWEEN :from AND :to";
        expressionAttributeValues[":from"] = from.getTime();
        expressionAttributeValues[":to"] = to.getTime();
    } else if (from !== undefined && from !== null) {
        keyConditionExpression += " and resource_created >= :from";
        expressionAttributeValues[":from"] = from.getTime();
    } else if (to !== undefined && to !== null) {
        keyConditionExpression += " and resource_created <= :to";
        expressionAttributeValues[":to"] = to.getTime();
    }

    return {
        TableName: null,
        IndexName: index,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: sortOrder === QuerySortOrder.Ascending,
        Limit: pageSize
    };
}
