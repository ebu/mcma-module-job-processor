output "service_registry_aws" {
  value = {
    auth_type   = module.service_registry_aws.auth_type
    service_url = module.service_registry_aws.service_url
  }
}
#
#output "service_registry_azure" {
#  value = {
#    auth_type   = module.service_registry_azure.auth_type
#    service_url = module.service_registry_azure.service_url
#  }
#}

output "job_processor_aws" {
  sensitive = true
  value     = {
    auth_type   = module.job_processor_aws.auth_type
    service_url = module.job_processor_aws.service_url
    api_key     = module.job_processor_aws.api_key
  }
}

output "deployment_api_key" {
  sensitive = true
  value     = random_password.deployment_api_key.result
}
