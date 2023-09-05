import { JobBaseProperties, JobStatus } from "@mcma/core";
import { FilterCriteria, FilterExpression, Query, QuerySortOrder } from "@mcma/data";

export type JobResourceQueryParameters = {
    partitionKey?: string;
    status?: JobStatus;
    from?: Date;
    to?: Date;
    sortOrder?: QuerySortOrder;
    pageSize?: number;
}

export function buildQuery<T extends JobBaseProperties>(queryParameters: JobResourceQueryParameters, pageStartToken: string): Query<T> {
    const { partitionKey, status, from, to, sortOrder, pageSize } = queryParameters;

    const filterExpressions: FilterExpression<T>[] = [];

    if (status !== null && status !== undefined) {
        filterExpressions.push(new FilterCriteria("status", "=", status));
    }

    if (from !== null && from !== undefined) {
        filterExpressions.push(new FilterCriteria("dateCreated", ">=", from));
    }

    if (to !== null && to !== undefined) {
        filterExpressions.push(new FilterCriteria("dateCreated", "<=", to));
    }

    return {
        path: partitionKey,
        sortBy: "dateCreated",
        sortOrder: sortOrder ?? QuerySortOrder.Descending,
        pageSize: pageSize,
        pageStartToken: pageStartToken,
        filterExpression: {
            logicalOperator: "&&",
            children: filterExpressions
        }
    };
}
