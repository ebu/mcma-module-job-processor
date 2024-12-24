import { app } from "@azure/functions";

import { apiHandler } from "./api-handler";
import { workerQueueHandler } from "./worker";
import { jobChecker } from "./job-checker";
import { jobCleanup } from "./job-cleanup";

app.http("api-handler", {
    route: "{*path}",
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "TRACE", "CONNECT"],
    authLevel: "anonymous",
    handler: apiHandler
});

app.storageQueue("worker", {
    queueName: process.env.WORKER_QUEUE_NAME,
    connection: undefined,
    handler: workerQueueHandler,
});

app.timer("job-checker", {
    schedule: "0 * * * * *",
    handler: jobChecker,
});

app.timer("job-cleanup", {
    schedule: "0 0 0 * * *",
    handler: jobCleanup,
});
