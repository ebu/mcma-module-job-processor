import { JobStatus } from "@mcma/core";
import { QuerySortOrder } from "@mcma/data";

export type JobResourceQueryParameters = {
    partitionKey?: string;
    status?: JobStatus;
    from?: Date;
    to?: Date;
    sortOrder?: QuerySortOrder;
    pageSize?: number;
}
