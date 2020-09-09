import * as fs from "fs";
import * as AWS from "aws-sdk";
import { AuthProvider, ResourceManager, ResourceManagerConfig } from "@mcma/client";
import { awsV4Auth } from "@mcma/aws-client";
import { ResourceEndpoint, Service } from "@mcma/core";

const AWS_CREDENTIALS = "../../deployment/aws-credentials.json";
const TERRAFORM_OUTPUT = "../../deployment/terraform.output.json";

AWS.config.loadFromPath(AWS_CREDENTIALS);

async function insertUpdateService(service: Service, resourceManager: ResourceManager) {
    let retrievedServices = await resourceManager.query(Service);

    for (const retrievedService of retrievedServices) {
        if (retrievedService.name === service.name) {
            if (!service.id) {
                service.id = retrievedService.id;

                console.log(`Updating ${service.name}`);
                await resourceManager.update(service);
            } else {
                console.log(`Removing duplicate ${service.name} '${retrievedService.id}'`);
                await resourceManager.delete(retrievedService);
            }
        }
    }

    if (!service.id) {
        console.log(`Inserting ${service.name}`);
        await resourceManager.create(service);
    }

    await resourceManager.init();
}

async function main() {
    try {
        const terraformOutput = JSON.parse(fs.readFileSync(TERRAFORM_OUTPUT, "utf8"));

        const servicesUrl = terraformOutput.service_registry_aws.value.services_url;
        const jobProfilesUrl = terraformOutput.service_registry_aws.value.job_profiles_url;
        const servicesAuthType = terraformOutput.service_registry_aws.value.auth_type;

        const resourceManagerConfig: ResourceManagerConfig = {
            servicesUrl,
            servicesAuthType
        };

        const resourceManager = new ResourceManager(resourceManagerConfig, new AuthProvider().add(awsV4Auth(AWS)));

        // 1. Inserting / updating service registry
        let serviceRegistry = new Service({
            name: "Service Registry",
            resources: [
                new ResourceEndpoint({ resourceType: "Service", httpEndpoint: servicesUrl }),
                new ResourceEndpoint({ resourceType: "JobProfile", httpEndpoint: jobProfilesUrl })
            ],
            authType: servicesAuthType
        });
        await insertUpdateService(serviceRegistry, resourceManager);

        // 2. Inserting / updating job processor
        const jobsUrl = terraformOutput.job_processor_aws.value.jobs_url;
        const jobsAuthType = terraformOutput.job_processor_aws.value.auth_type;

        const jobProcessor = new Service({
            name: "Job Processor",
            resources: [
                new ResourceEndpoint({
                    resourceType: "AmeJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "AIJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "CaptureJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "QAJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "TransferJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "TransformJob",
                    httpEndpoint: jobsUrl
                }),
                new ResourceEndpoint({
                    resourceType: "WorkflowJob",
                    httpEndpoint: jobsUrl
                })
            ],
            authType: jobsAuthType
        });

        await insertUpdateService(jobProcessor, resourceManager);
    } catch (error) {
        if (error.response && error.response.data) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error);
        }
    }
}

main().then(() => console.log("Done"));
