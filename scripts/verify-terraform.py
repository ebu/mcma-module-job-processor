"""Validate the deployment in isolation, including downloaded Service Registry modules.

Run after Gradle build. Never reads deployment credentials, variables or state.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
terraform = os.environ.get('TERRAFORM', 'terraform')
with tempfile.TemporaryDirectory(prefix='mcma-job-processor-terraform-') as directory:
    fixture = Path(directory)
    release = '--release' in sys.argv
    for relative in (['deployment'] if release else ['deployment', 'aws/module', 'azure/module']):
        source = root / relative
        destination = fixture / relative
        destination.mkdir(parents=True)
        for file in source.rglob('*'):
            if '.terraform' in file.parts or not file.is_file():
                continue
            allowed = file.suffix == '.tf' if relative == 'deployment' else file.suffix in ['.tf', '.json', '.zip']
            if allowed:
                target = destination / file.relative_to(source)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, target)
    if release:
        for cloud in ['aws', 'azure']:
            destination = fixture / cloud / 'module'
            destination.mkdir(parents=True)
            with zipfile.ZipFile(root / 'build/release' / ('terraform-' + cloud + '.zip')) as archive:
                for name in archive.namelist():
                    target = (destination / name).resolve()
                    if destination.resolve() not in target.parents:
                        raise ValueError('Unsafe archive path: ' + name)
                archive.extractall(destination)
    # Use the committed provider selections. init verifies their registry checksums.
    shutil.copyfile(root / 'deployment/.terraform.lock.hcl', fixture / 'deployment/.terraform.lock.hcl')
    deployment = fixture / 'deployment'
    subprocess.run([terraform, 'init', '-backend=false', '-input=false', '-lockfile=readonly', '-no-color'], cwd=str(deployment), check=True)
    subprocess.run([terraform, 'validate', '-no-color'], cwd=str(deployment), check=True)
print('Deployment and public Service Registry modules validated without accessing state.')
