#########################
# Provider registration
#########################

provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
}

provider "mcma" {
  alias = "aws"

  service_registry_url       = module.service_registry_aws.service_url
  service_registry_auth_type = module.service_registry_aws.auth_type

  aws4_auth {
    profile = var.aws_profile
    region  = var.aws_region
  }

  mcma_api_key_auth {
    api_key = random_password.deployment_api_key.result
  }
}

############################################
# Cloud watch log group for central logging
############################################

resource "aws_cloudwatch_log_group" "main" {
  name = "/mcma/${var.prefix}"
}

#########################
# Service Registry Module
#########################

module "service_registry_aws" {
  source = "github.com/ebu/mcma-module-service-registry//aws/module?ref=v1.0.0"

  prefix = "${var.prefix}-service-registry"

  aws_region = var.aws_region

  log_group                   = aws_cloudwatch_log_group.main
  api_gateway_metrics_enabled = true
  xray_tracing_enabled        = true
  enhanced_monitoring_enabled = true

  api_keys_read_only = [
    module.job_processor_aws.api_key
  ]
  api_keys_read_write = [
    random_password.deployment_api_key.result
  ]
}

#########################
# Job Processor Module
#########################

module "job_processor_aws" {
  providers = {
    mcma = mcma.aws
  }

  source = "../aws/module"

  prefix = "${var.prefix}-job-processor"

  dashboard_name = var.prefix

  aws_region = var.aws_region

  service_registry = module.service_registry_aws
  execute_api_arns = [
    "${module.service_registry_aws.aws_apigatewayv2_stage.service_api.execution_arn}/*/*"
  ]

  log_group                   = aws_cloudwatch_log_group.main
  api_gateway_metrics_enabled = true
  xray_tracing_enabled        = true

  api_keys_read_write = [
    random_password.deployment_api_key.result
  ]
}

resource "mcma_job_profile" "transcribe_aws" {
  provider = mcma.aws

  name = "TranscribeAzure"

  input_parameter {
    name = "inputFile"
    type = "Locator"
  }

  input_parameter {
    name = "exportFormats"
    type = "string[]"
  }

  input_parameter {
    name     = "keywords"
    type     = "string[]"
    optional = true
  }

  output_parameter {
    name = "transcription"
    type = "{[key: string]: S3Locator}"
  }
}
