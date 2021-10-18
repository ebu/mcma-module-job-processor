#########################
# Provider registration
#########################

provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
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
  source = "https://ch-ebu-mcma-module-repository.s3.eu-central-1.amazonaws.com/ebu/service-registry/aws/0.13.27/module.zip"

  prefix = "${var.global_prefix}-service-registry"

  aws_account_id = var.aws_account_id
  aws_region     = var.aws_region
  stage_name     = var.environment_type

  log_group                   = aws_cloudwatch_log_group.main
  api_gateway_logging_enabled = true
  api_gateway_metrics_enabled = true
  xray_tracing_enabled        = true

  services = [
    module.job_processor_aws.service_definition
  ]
}

#########################
# Job Processor Module
#########################

module "job_processor_aws" {
  source = "../aws/build/staging"

  prefix = "${var.global_prefix}-job-processor"

  stage_name     = var.environment_type
  dashboard_name = var.global_prefix

  aws_account_id = var.aws_account_id
  aws_region     = var.aws_region

  service_registry = module.service_registry_aws
  execute_api_arns = [
    "${module.service_registry_aws.aws_apigatewayv2_stage.service_api.execution_arn}/*/*"
  ]

  log_group                   = aws_cloudwatch_log_group.main
  api_gateway_logging_enabled = true
  api_gateway_metrics_enabled = true
  xray_tracing_enabled        = true
}
