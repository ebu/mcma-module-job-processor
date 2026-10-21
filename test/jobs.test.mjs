import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

process.env.MCMA_WORKER_FUNCTION_ID = 'test-worker';
process.env.DEFAULT_JOB_TIMEOUT_IN_MINUTES = '60';
process.env.JOB_RETENTION_PERIOD_IN_DAYS = '30';
const require = createRequire(new URL('../libraries/job-checker/package.json', import.meta.url));
const { JobStatus } = await import(pathToFileURL(require.resolve('@mcma/core')).href);
const { JobChecker } = await import('../libraries/job-checker/build/staging/index.js');
const { JobCleanup } = await import('../libraries/job-cleanup/build/staging/index.js');
const logger = { info() {} };

function fixture(jobs = [], locked = true) {
    const calls = [];
    let unlocks = 0;
    let queries = 0;
    const controller = {
        async getDbTable() {
            return { createMutex: () => ({ tryLock: async () => locked, unlock: async () => { unlocks++; } }) };
        },
        async queryJobs({ status }) { queries++; return { results: jobs.filter(job => job.status === status) }; },
        async getExecutions() { return { results: [] }; }
    };
    const invoker = { async invoke(functionId, request) { calls.push({ functionId, request }); } };
    return { controller, invoker, calls, get unlocks() { return unlocks; }, get queries() { return queries; } };
}

test('checker skips work when another invocation holds its mutex', async () => {
    const f = fixture([], false);
    await new JobChecker(logger, f.controller, f.invoker, 'request').run();
    assert.equal(f.queries, 0);
    assert.equal(f.unlocks, 0);
    assert.deepEqual(f.calls, []);
});

test('checker fails expired jobs while preserving healthy jobs and tracker data', async () => {
    const now = Date.now();
    const tracker = { id: 'tracker', label: 'test' };
    const f = fixture([
        { id: 'deadline', status: JobStatus.Running, deadline: new Date(now - 60000), dateCreated: new Date(now), tracker },
        { id: 'timeout', status: JobStatus.Running, timeout: 5, dateCreated: new Date(now - 600000), tracker },
        { id: 'healthy', status: JobStatus.Running, timeout: 30, dateCreated: new Date(now), tracker }
    ]);
    await new JobChecker(logger, f.controller, f.invoker, 'request').run();
    assert.equal(f.unlocks, 1);
    assert.deepEqual(f.calls.map(c => c.request.input.jobId), ['deadline', 'timeout']);
    for (const call of f.calls) {
        assert.equal(call.functionId, 'test-worker');
        assert.equal(call.request.operationName, 'FailJob');
        assert.equal(call.request.tracker, tracker);
    }
    assert.match(f.calls[0].request.input.error.type, /job-deadline-passed$/);
    assert.match(f.calls[1].request.input.error.type, /job-timeout-passed$/);
});

test('checker releases its mutex when reading jobs fails', async () => {
    const f = fixture();
    f.controller.queryJobs = async () => { throw new Error('database unavailable'); };
    await assert.rejects(new JobChecker(logger, f.controller, f.invoker, 'request').run(), /database unavailable/);
    assert.equal(f.unlocks, 1);
});

test('cleanup requests deletion only for terminal jobs older than retention', async () => {
    const now = Date.now();
    const jobs = [
        { id: 'old-complete', status: JobStatus.Completed, dateCreated: new Date(now - 40 * 86400000) },
        { id: 'old-failed', status: JobStatus.Failed, dateCreated: new Date(now - 40 * 86400000) },
        { id: 'old-canceled', status: JobStatus.Canceled, dateCreated: new Date(now - 40 * 86400000) },
        { id: 'old-running', status: JobStatus.Running, dateCreated: new Date(now - 40 * 86400000) },
        { id: 'recent', status: JobStatus.Completed, dateCreated: new Date(now - 86400000) }
    ];
    const f = fixture(jobs);
    f.controller.queryJobs = async ({ status, to }) => {
        assert.ok(Math.abs(to.getTime() - (now - 30 * 86400000)) < 10000);
        return { results: jobs.filter(job => job.status === status && job.dateCreated < to) };
    };
    await new JobCleanup(logger, f.controller, f.invoker).run();
    assert.deepEqual(f.calls.map(c => c.request.input.jobId), ['old-complete', 'old-failed', 'old-canceled']);
    assert.ok(f.calls.every(c => c.functionId === 'test-worker' && c.request.operationName === 'DeleteJob'));
});
