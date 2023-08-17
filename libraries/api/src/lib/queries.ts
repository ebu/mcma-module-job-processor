import { JobStatus } from "@mcma/core";
import { QuerySortOrder } from "@mcma/data";

import { JobResourceQueryParameters } from "@local/data";

export function buildQueryParameters(queryParams: { [key: string]: any }, defaultPageSize?: number): JobResourceQueryParameters {
    const status = <JobStatus>queryParams.status;

    let from = new Date(queryParams.from);
    if (isNaN(from.getTime())) {
        from = undefined;
    }

    let to = new Date(queryParams.to);
    if (isNaN(to.getTime())) {
        to = undefined;
    }

    let sortOrder: QuerySortOrder = QuerySortOrder.Ascending;
    if (queryParams.sortOrder) {
        sortOrder = queryParams.sortOrder.toLowerCase() === QuerySortOrder.Descending ? QuerySortOrder.Descending : QuerySortOrder.Ascending;
        delete queryParams.sortOrder;
    }

    let pageSize;
    if (queryParams.pageSize) {
        pageSize = parseInt(queryParams.pageSize);
        if (isNaN(pageSize)) {
            pageSize = undefined;
        }
        delete queryParams.pageSize;
    }

    if (defaultPageSize) {
        // setting limit to default value of 100 if no other limitation is set
        if ((from === undefined || from === null) &&
            (to === undefined || to === null) &&
            (pageSize === undefined || pageSize === null)) {
            pageSize = defaultPageSize;
        }
    }

    return {
        status,
        from,
        to,
        sortOrder,
        pageSize
    };
}
