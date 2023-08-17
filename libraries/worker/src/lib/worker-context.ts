import { DataController } from "@local/data";

export interface WorkerContext {
    requestId: string
    dataController: DataController
    enablePeriodicJobChecker: () => Promise<void>
}
