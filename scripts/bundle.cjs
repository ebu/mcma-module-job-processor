const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createRequire, isBuiltin } = require('node:module');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function packageDirectory(name, from) {
    const resolve = createRequire(path.join(from, 'package.json')).resolve;
    let entry;
    try { entry = resolve(`${name}/package.json`); }
    catch { entry = resolve(name); }
    for (let dir = path.dirname(entry); dir !== path.dirname(dir); dir = path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && readJson(path.join(dir, 'package.json')).name === name) return dir;
    }
    throw new Error(`Cannot locate runtime dependency ${name}`);
}

// Copy only explicitly external packages and their installed runtime dependency
// closure. Nested dependencies retain their exact installed resolution.
function copyExternal(name, from, parent, ancestors = new Map()) {
    const source = packageDirectory(name, from);
    if (ancestors.has(source)) return;
    const destination = path.join(parent, 'node_modules', name);
    fs.cpSync(source, destination, { recursive: true,
        filter: file => !path.relative(source, file).split(path.sep).includes('node_modules') });
    const next = new Map(ancestors).set(source, destination);
    const manifest = readJson(path.join(source, 'package.json'));
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
        try { packageDirectory(dependency, source); }
        catch (error) {
            if (manifest.optionalDependencies?.[dependency] || manifest.peerDependenciesMeta?.[dependency]?.optional) continue;
            throw error;
        }
        copyExternal(dependency, source, destination, next);
    }
    return manifest.version;
}

function writeNotices(inputs, destination) {
    const packages = new Set();
    for (const input of Object.keys(inputs)) {
        if (!input.includes('node_modules/')) continue;
        for (let dir = path.dirname(path.resolve(root, input)); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
            if (fs.existsSync(path.join(dir, 'package.json')) && readJson(path.join(dir, 'package.json')).name) { packages.add(dir); break; }
        }
    }
    const notices = [];
    for (const dir of [...packages].sort()) {
        const manifest = readJson(path.join(dir, 'package.json'));
        const files = fs.readdirSync(dir).filter(name => /^(licen[cs]e|notice|copyright)(\.|$)/i.test(name) && fs.statSync(path.join(dir, name)).isFile());
        for (const file of files) notices.push(`${manifest.name}@${manifest.version} — ${file}\n\n${fs.readFileSync(path.join(dir, file), 'utf8')}`);
    }
    fs.writeFileSync(path.join(destination, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n---\n\n'));
}

function verifyBundle(directory, main, platform) {
    // Outside the checkout: missing dependencies cannot resolve against a parent node_modules.
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mcma-bundle-'));
    try {
        fs.cpSync(directory, fixture, { recursive: true });
        fs.copyFileSync(path.join(root, 'scripts/check-entrypoint.mjs'), path.join(fixture, 'check-entrypoint.mjs'));
        const result = spawnSync(process.execPath, ['check-entrypoint.mjs', path.join(fixture, main), platform], {
            cwd: fixture, env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8'
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Isolated bundle check failed:\n${result.stdout}\n${result.stderr}`);
        console.log(result.stdout.trim());
    } finally {
        assert.ok(path.dirname(fixture) === path.resolve(os.tmpdir()) && path.basename(fixture).startsWith('mcma-bundle-'));
        fs.rmSync(fixture, { recursive: true, force: true });
    }
}

async function bundle(directory, platform) {
    const pkg = path.resolve(directory);
    assert.ok(['aws', 'azure'].includes(platform));
    assert.ok(pkg.startsWith(path.join(root, platform) + path.sep));
    const destination = path.join(pkg, 'build/bundle');
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    const manifest = readJson(path.join(pkg, 'package.json'));
    const main = platform === 'azure' ? 'src/index.js' : 'index.js';
    // The identity SDK's browser helper reads its own xdg-open file at runtime.
    const external = platform === 'azure' ? ['@azure/functions', 'open'] : [];
    // debug deliberately catches MODULE_NOT_FOUND for this uninstalled color helper.
    const optionalExternal = new Set(['supports-color']);
    const result = await esbuild.build({
        absWorkingDir: root,
        entryPoints: [path.join(pkg, 'build/staging', main)],
        outfile: path.join(destination, main),
        bundle: true, platform: 'node', format: 'esm', target: 'node22',
        mainFields: ['module', 'main'], external,
        treeShaking: true, minify: false, keepNames: true,
        sourcemap: 'linked', sourcesContent: false, legalComments: 'linked', metafile: true,
        banner: { js: "import { createRequire as __mcmaCreateRequire } from 'node:module'; const require = __mcmaCreateRequire(import.meta.url);" }
    });
    assert.equal(result.warnings.length, 0, 'Investigate bundler warnings before deploying');
    for (const output of Object.values(result.metafile.outputs)) for (const item of output.imports) {
        assert.ok(!item.external || isBuiltin(item.path) || optionalExternal.has(item.path) || external.some(name => item.path === name || item.path.startsWith(name + '/')),
            `Unexpected external dependency: ${item.path}`);
    }
    const dependencies = Object.fromEntries(external.map(name => [name, copyExternal(name, pkg, destination)]));
    fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({
        name: manifest.name, version: manifest.version, private: true, type: 'module', main,
        engines: manifest.engines, dependencies
    }, null, 2) + '\n');
    if (platform === 'azure') fs.copyFileSync(path.join(pkg, 'host.json'), path.join(destination, 'host.json'));
    writeNotices(result.metafile.inputs, destination);
    fs.writeFileSync(path.join(pkg, 'build/bundle-meta.json'), JSON.stringify(result.metafile, null, 2));
    verifyBundle(destination, main, platform);
    console.log(`Bundled ${path.relative(root, pkg)} (${Object.keys(result.metafile.inputs).length} inputs).`);
}
module.exports = { bundle };
if (require.main === module) bundle(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
