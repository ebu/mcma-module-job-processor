# MCMA Job Processor

AWS and Azure Job Processor modules using MCMA libraries 2.0.0 and native ESM.
The planned module release is **2.0.0** (`release-version.txt`).

## Build and verify

Use Node.js 22 or newer and Java 17 or newer. The Gradle wrapper selects Gradle
9.8.2. TypeScript and esbuild are installed locally at pinned versions.

```powershell
npm ci
npm run verify
.\gradlew.bat build -PreleaseBuild --no-daemon
python scripts/verify-terraform.py
```

`npm run verify` installs locked dependencies, compiles all seven local libraries
and five application packages, and loads each bundled entry point in isolation
with network access blocked. It also checks timeout handling, mutex recovery and
retention cleanup using Node's built-in test runner. Gradle retains the existing `npmPack` dependency
relationships between local libraries and produces the deployable ZIP files.
`-PreleaseBuild` excludes deployment configuration, so building needs no cloud
credentials or local `gradle.properties`.

Terraform verification requires Terraform 1.10 or newer (CI uses 1.16.6). It
copies only module files into a temporary directory, downloads the public Service
Registry 2.0.0 release archives, and runs init/validate without accessing state.
It does not plan or deploy infrastructure.

CI verifies Node.js 22, 24 and 26 on Linux and Node.js 22 on Windows. It also
checks the Gradle build and complete Terraform deployment configuration. Pull
requests and pushes to main trigger verification; feature branch pushes do not
trigger a duplicate run.

## Deployment

With your existing deployment settings and credentials:

```powershell
npm ci
.\gradlew.bat plan
.\gradlew.bat deploy
```

Review the plan before deploying. AWS functions use Node.js 26 and Azure functions
use Node.js 24. Deployment consumes the AWS and Azure Service Registry 2.0.0
Terraform ZIPs from GitHub Releases, including their prebuilt application code.
AzAPI requires 2.13.0 or newer (`>= 2.13.0`); deployment testing confirmed that
2.13.0 works. The lockfile records the selected provider version. AzureRM 5 uses service endpoint blocks and explicitly preserves
Key Vault access-policy authentication.

The application ZIPs are bundled with esbuild, including source maps and license
notices. Azure retains only required external runtime packages, rather than the
entire development dependency tree. Tracked deployment ZIPs remain until release consumption has been verified with
Cloud Storage Service.

## Releases

`release-version.txt` is the source of the module release version (currently 2.0.0).
After merging the PR into main, open **Actions > Prepare release > Run workflow**:

1. Select **main**. Leave **Create a draft release** unchecked for a dry run.
2. To prepare a publishable release, run it with **Create a draft release** checked.
3. Review the draft under **Releases**, then publish it manually.

Both modes run the Node verification matrix and build/validate the release archives.
The draft job downloads those exact verified artifacts; it does not rebuild them.
Only the draft job has repository write permission. Existing version tags are
rejected; use a new version for changes to published releases.

The four assets are `terraform-aws.zip`, `terraform-azure.zip`, `SHA256SUMS`, and
`release.json`. The AWS module includes four Lambda ZIPs and its dashboard template;
the Azure module includes its Function App ZIP. Module archives contain no state,
credentials, deployment variables, or provider caches. The metadata records the
source commit, version, runtime versions and archive SHA-256 checksums.

To build and validate locally without deployment credentials:

```powershell
npm ci
.\gradlew.bat prepareRelease -PreleaseBuild --no-daemon
python scripts/verify-release.py
```

Local metadata uses `local` as its revision unless `-PsourceRevision=<commit>` is
supplied. The GitHub workflow supplies and verifies the actual workflow commit.

After publishing v2.0.0, consumers can reference:

```hcl
# AWS
source = "https://github.com/ebu/mcma-module-job-processor/releases/download/v2.0.0/terraform-aws.zip"

# Azure
source = "https://github.com/ebu/mcma-module-job-processor/releases/download/v2.0.0/terraform-azure.zip"
```

Draft release assets are not publicly downloadable. Publish the reviewed draft
before updating downstream consumers to these URLs.
