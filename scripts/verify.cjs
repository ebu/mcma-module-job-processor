const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run verify.');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function run(args, cwd = root) {
    const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Verification failed: ${args.join(' ')}`);
}
function reset(directory) {
    assert.ok(directory.startsWith(root + path.sep) && directory.split(path.sep).some(p => ['build', 'node_modules'].includes(p)));
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
}
const packages = ['libraries', 'aws', 'azure'].flatMap(group =>
    fs.readdirSync(path.join(root, group), { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(root, group, e.name, 'package.json')))
        .map(e => {
            const dir = path.join(root, group, e.name);
            return { dir, group, manifest: readJson(path.join(dir, 'package.json')), output: path.join(dir, 'build/staging') };
        }));
const byName = new Map(packages.map(p => [p.manifest.name, p]));
// Match the Gradle npmPack dependency graph, including dependencies used only by types.
function dependencies(pkg) {
    const gradle = fs.readFileSync(path.join(pkg.dir, 'build.gradle'), 'utf8');
    return [...gradle.matchAll(/dependsOn ":libraries:([^:]+):npmPack"/g)].map(match => {
        const dep = byName.get('@local/' + match[1]);
        assert.ok(dep, `Unknown local library ${match[1]}`);
        return dep;
    });
}
const built = new Set();
const building = new Set();
function build(pkg) {
    if (built.has(pkg)) return;
    assert.ok(!building.has(pkg), `Dependency cycle: ${pkg.manifest.name}`);
    building.add(pkg);
    dependencies(pkg).forEach(build);
    console.log(`Verifying ${path.relative(root, pkg.dir)}`);
    run([npm, 'ci', '--no-audit', '--no-fund'], pkg.dir);
    const injected = new Set();
    function inject(dep) {
        if (injected.has(dep)) return;
        injected.add(dep);
        dependencies(dep).forEach(inject);
        const destination = path.join(pkg.dir, 'node_modules', dep.manifest.name);
        reset(destination);
        fs.cpSync(dep.output, destination, { recursive: true });
        // Preserve each library's locked external tree while sharing local/MCMA class identities.
        fs.cpSync(path.join(dep.dir, 'node_modules'), path.join(destination, 'node_modules'), {
            recursive: true,
            filter: source => !['@local', '@mcma'].some(scope => source.includes(`${path.sep}node_modules${path.sep}${scope}`))
        });
    }
    dependencies(pkg).forEach(inject);
    run([path.join(root, 'scripts/check-dependencies.cjs'), pkg.dir]);
    reset(pkg.output);
    run([path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], pkg.dir);
    fs.copyFileSync(path.join(pkg.dir, 'package.json'), path.join(pkg.output, 'package.json'));
    if (pkg.group !== 'libraries') run([path.join(root, 'scripts/bundle.cjs'), pkg.dir, pkg.group]);
    building.delete(pkg);
    built.add(pkg);
}
packages.forEach(build);
run(['--test', path.join(root, 'test/jobs.test.mjs')]);
console.log(`Verified ${built.size} packages and five isolated deployment bundles on Node ${process.versions.node}.`);
