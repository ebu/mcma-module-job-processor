#########################
# Environment Variables
#########################

variable "environment_name" {}
variable "environment_type" {}

variable "prefix" {}

#########################
# AWS Variables
#########################

variable "aws_profile" {}
variable "aws_region" {}

##############
# Azure
##############

variable "azure_tenant_id" {
  type        = string
  description = "Azure Tenant Id where infrastructure will be deployed"
}

variable "azure_subscription_id" {
  type        = string
  description = "Azure Subscription Id where infrastructure will be deployed"
}

variable azure_location {
  type        = string
  description = "Azure Location where infrastructure will be deployed"
}

variable "AZURE_CLIENT_ID" {
  type        = string
  description = "Azure Client ID where infrastructure will be deployed. Set through TF_VAR_ environment variable"
  default     = null
}

variable "AZURE_CLIENT_SECRET" {
  type        = string
  description = "Azure Client Secret where infrastructure will be deployed. Set through TF_VAR_ environment variable"
  default     = null
}

