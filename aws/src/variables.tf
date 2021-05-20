#########################
# Environment Variables
#########################

variable "name" {
  type = string
  description = "Optional variable to set a custom name for this service in the service registry"
  default = "Job Processor"
}

variable "prefix" {
  type        = string
  description = "Prefix for all managed resources in this module"
}

variable "stage_name" {
  type        = string
  description = "Stage name to be used for the API Gateway deployment"
}

variable "log_group" {
  type        = object({
    id   = string
    arn  = string
    name = string
  })
  description = "Log group used by MCMA Event tracking"
}

variable "dashboard_name" {
  type        = string
  description = "Name that services as prefix for dashboard related resources"
}

variable "dead_letter_config_target" {
  type        = string
  description = "Configuring dead letter target for worker lambda"
  default     = null
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to created resources"
  default     = {}
}

#########################
# AWS Variables
#########################

variable "aws_account_id" {
  type        = string
  description = "Account ID to which this module is deployed"
}

variable "aws_region" {
  type        = string
  description = "AWS Region to which this module is deployed"
}

variable "iam_role_path" {
  type        = string
  description = "Path for creation of access role"
  default     = "/"
}

variable "iam_policy_path" {
  type        = string
  description = "Path for creation of access policy"
  default     = "/"
}

#########################
# Dependencies
#########################

variable "service_registry" {
  type = object({
    auth_type    = string,
    services_url = string,
  })
}

#########################
# Configuration
#########################

variable "default_job_timeout_in_minutes" {
  type        = number
  description = "Set default job timeout in minutes"
  default     = 60
}
variable "job_retention_period_in_days" {
  type        = number
  description = "Set job retention period in days"
  default     = 90
}

variable "api_gateway_logging_enabled" {
  type        = bool
  description = "Enable API Gateway logging"
  default     = false
}

variable "api_gateway_metrics_enabled" {
  type        = bool
  description = "Enable API Gateway metrics"
  default     = false
}

variable "xray_tracing_enabled" {
  type        = bool
  description = "Enable X-Ray tracing"
  default     = false
}

variable "enhanced_monitoring_enabled" {
  type        = bool
  description = "Enable CloudWatch Lambda Insights"
  default     = false
}

#########################
# Custom Job Types
#########################

variable "custom_job_types" {
  type        = list(string)
  description = "Optionally add custom job types"
  default     = []
}
