#########################
# Provider registration
#########################

provider "azurerm" {
  tenant_id       = var.azure_tenant_id
  subscription_id = var.azure_subscription_id
  client_id       = var.AZURE_CLIENT_ID
  client_secret   = var.AZURE_CLIENT_SECRET

  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

provider "mcma" {
  alias = "azure"

  service_registry_url = module.service_registry_azure.service_url

  mcma_api_key_auth {
    api_key = random_password.deployment_api_key.result
  }
}

######################
# Resource Group
######################

resource "azurerm_resource_group" "resource_group" {
  name     = "${var.prefix}-${var.azure_location}"
  location = var.azure_location
}

######################
# App Storage Account
######################

resource "azurerm_storage_account" "app_storage_account" {
  name                     = format("%.24s", replace("${var.prefix}-${azurerm_resource_group.resource_group.location}", "/[^a-z0-9]+/", ""))
  resource_group_name      = azurerm_resource_group.resource_group.name
  location                 = azurerm_resource_group.resource_group.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

######################
# Cosmos DB
######################

resource "azurerm_cosmosdb_account" "cosmosdb_account" {
  name                = var.prefix
  resource_group_name = azurerm_resource_group.resource_group.name
  location            = azurerm_resource_group.resource_group.location
  offer_type          = "Standard"

  consistency_policy {
    consistency_level = "Strong"
  }

  geo_location {
    failover_priority = 0
    location          = azurerm_resource_group.resource_group.location
  }
}

resource "azurerm_cosmosdb_sql_database" "cosmosdb_database" {
  name                = var.prefix
  resource_group_name = azurerm_resource_group.resource_group.name
  account_name        = azurerm_cosmosdb_account.cosmosdb_account.name
  autoscale_settings {
    max_throughput = 1000
  }
}

########################
# Application Insights
########################

resource "azurerm_log_analytics_workspace" "app_insights" {
  name                = var.prefix
  resource_group_name = azurerm_resource_group.resource_group.name
  location            = azurerm_resource_group.resource_group.location
}

resource "azurerm_application_insights" "app_insights" {
  name                = var.prefix
  resource_group_name = azurerm_resource_group.resource_group.name
  location            = azurerm_resource_group.resource_group.location
  workspace_id        = azurerm_log_analytics_workspace.app_insights.id
  application_type    = "web"
}

#########################
# Service Registry Module
#########################

module "service_registry_azure" {
  source = "github.com/ebu/mcma-module-service-registry//azure/module?ref=v0.16.13"

  prefix = "${var.prefix}-sr"

  resource_group      = azurerm_resource_group.resource_group
  app_storage_account = azurerm_storage_account.app_storage_account
  app_insights        = azurerm_application_insights.app_insights
  cosmosdb_account    = azurerm_cosmosdb_account.cosmosdb_account
  cosmosdb_database   = azurerm_cosmosdb_sql_database.cosmosdb_database

  api_keys_read_only = [
    module.job_processor_azure.api_key
  ]

  api_keys_read_write = [
    random_password.deployment_api_key.result
  ]

  key_vault_secret_expiration_date = "2100-01-01T00:00:00Z"
}

#########################
# Job Processor Module
#########################

module "job_processor_azure" {
  providers = {
    mcma = mcma.azure
  }

  source = "../azure/module"

  prefix = "${var.prefix}-jp"

  resource_group      = azurerm_resource_group.resource_group
  app_storage_account = azurerm_storage_account.app_storage_account
  app_insights        = azurerm_application_insights.app_insights
  cosmosdb_account    = azurerm_cosmosdb_account.cosmosdb_account
  cosmosdb_database   = azurerm_cosmosdb_sql_database.cosmosdb_database

  service_registry = module.service_registry_azure

  api_keys_read_write = [
    random_password.deployment_api_key.result
  ]

  key_vault_secret_expiration_date = "2100-01-01T00:00:00Z"
}

resource "mcma_job_profile" "transcribe_azure" {
  provider = mcma.azure

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
