"""Check release contents and validate a consumer using the actual release archives."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
release = root / 'build/release'
metadata = json.loads((release / 'release.json').read_text(encoding='utf-8'))
assert metadata['version'] == (root / 'release-version.txt').read_text().strip()
assert metadata['runtimes'] == {'aws': 'nodejs26.x', 'azure': '24'}
if os.environ.get('GITHUB_SHA'):
    assert metadata['revision'] == os.environ['GITHUB_SHA'], 'Release revision differs from CI commit'
applications = {
    'aws': {('lambdas/' + name + '.zip'): (name + '/build/dist/lambda.zip')
            for name in ['api-handler', 'job-checker', 'job-cleanup', 'worker']},
    'azure': {'function-app.zip': 'function-app/build/dist/function.zip'}
}
sums = ''
assert set(metadata['sha256']) == {'terraform-aws.zip', 'terraform-azure.zip'}
for cloud, bundles in applications.items():
    archive = release / ('terraform-' + cloud + '.zip')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert metadata['sha256'][archive.name] == digest, 'Archive checksum mismatch'
    sums += '{}  {}\n'.format(digest, archive.name)
    module = root / cloud / 'module'
    sources = {p.relative_to(module).as_posix() for p in module.rglob('*.tf')}
    if cloud == 'aws':
        sources.add('dashboard.json')
    with zipfile.ZipFile(archive) as zipped:
        files = [name for name in zipped.namelist() if not name.endswith('/')]
        assert len(files) == len(set(files)), 'Duplicate archive entries'
        assert set(files) == sources | set(bundles) | {'LICENSE'}, 'Unexpected or missing archive contents'
        assert zipped.read('LICENSE') == (root / 'LICENSE').read_bytes()
        for name in sources:
            assert zipped.read(name) == (module / name).read_bytes(), 'Stale source: ' + name
        for name, built in bundles.items():
            payload = zipped.read(name)
            assert payload == (root / cloud / built).read_bytes(), 'Stale application: ' + name
            with zipfile.ZipFile(io.BytesIO(payload)) as app:
                manifest = json.loads(app.read('package.json'))
                assert manifest['type'] == 'module'
                entry = 'index.js' if cloud == 'aws' else 'src/index.js'
                assert manifest['main'] == entry and entry in app.namelist()
                if cloud == 'azure':
                    assert 'host.json' in app.namelist()
    print('Verified {}: {}'.format(archive.name, digest), flush=True)
assert (release / 'SHA256SUMS').read_text() == sums
# The deployment references these extracted modules and the public Service Registry
# archives. Validation uses no deployment variables, credentials, backend or state.
subprocess.run([sys.executable, str(root / 'scripts/verify-terraform.py'), '--release'], check=True)
