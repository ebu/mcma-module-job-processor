#########################
# Provider registration
#########################

provider "aws" {
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
  region     = var.aws_region
}

############################################
# Cloud watch log group for central logging
############################################

resource "aws_cloudwatch_log_group" "main" {
  name = "/mcma/${var.global_prefix}"
}

#########################
# Service Registry Module
#########################

module "service_registry_aws" {
  source = "https://ch-ebu-mcma-module-repository.s3.eu-central-1.amazonaws.com/ebu/service-registry/aws/0.13.7/module.zip"

  aws_account_id = var.aws_account_id
  aws_region     = var.aws_region
  log_group_name = aws_cloudwatch_log_group.main.name
  module_prefix  = "${var.global_prefix}-service-registry"
  stage_name     = var.environment_type
}

#########################
# Job Processor Module
#########################

module "job_processor_aws" {
  source = "../aws/build/staging"

  aws_account_id   = var.aws_account_id
  aws_region       = var.aws_region
  log_group_name   = aws_cloudwatch_log_group.main.name
  module_prefix    = "${var.global_prefix}-job-processor"
  stage_name       = var.environment_type
  service_registry = module.service_registry_aws
  dashboard_name   = var.global_prefix

  api_gateway_logging_enabled = true
  api_gateway_metrics_enabled = true
  xray_tracing_enabled        = true
}
