import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

// Loading handlers must not perform network I/O. Fail if initialization tries to connect.
net.Socket.prototype.connect = () => { throw new Error('Unexpected network access during entry-point verification'); };
tls.connect = () => { throw new Error('Unexpected TLS access during entry-point verification'); };
syncBuiltinESMExports();
for (const name of Object.keys(process.env)) {
    if (/^(AWS_|AZURE_|MCMA_|APPINSIGHTS_|APPLICATIONINSIGHTS_|OTEL_)/.test(name)) delete process.env[name];
}
Object.assign(process.env, {
    AWS_REGION: 'eu-west-1', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test',
    MCMA_TABLE_NAME: 'test', MCMA_PUBLIC_URL: 'https://example.invalid', MCMA_WORKER_FUNCTION_ID: 'test',
    AWS_EC2_METADATA_DISABLED: 'true', AWS_LAMBDA_LOG_GROUP_NAME: 'test', RUN_LOCAL: 'true',
    MCMA_COSMOS_DB_ENDPOINT: 'https://localhost:8081', MCMA_COSMOS_DB_KEY: 'dGVzdA==',
    MCMA_API_KEY_SECRET_ID: 'test', MCMA_LOG_GROUP_NAME: 'test', MCMA_KEY_VAULT_URL: 'https://example.vault.azure.net',
    MCMA_COSMOS_DB_DATABASE_ID: 'test', MCMA_COSMOS_DB_REGION: 'test', WORKER_QUEUE_NAME: 'test', STORAGE_CLIENT_CONFIG_SECRET_ID: 'test'
});
const entry = await import(pathToFileURL(process.argv[2]).href);
if (process.argv[3] === 'aws') assert.equal(typeof entry.handler, 'function');
console.log('ESM entry point loaded: ' + process.argv[2]);
