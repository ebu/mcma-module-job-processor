// Guard the locked third-party versions after Gradle injects local npm tarballs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = path.resolve(process.argv[2]);
const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
for (const [name, expected] of Object.entries(lock.packages)) {
    if (!name) continue;
    const manifest = path.join(directory, name, 'package.json');
    // Optional platform packages can be absent; npm may also deduplicate nested entries.
    if (!fs.existsSync(manifest)) continue;
    const installed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    assert.equal(installed.version, expected.version, `Local library installation changed locked ${name}`);
}
