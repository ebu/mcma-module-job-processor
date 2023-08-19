locals {
  service_api_zip_file      = "${path.module}/functions/api-handler.zip"
  service_api_function_name = format("%.32s", replace("${var.prefix}${var.resource_group.location}", "/[^a-z0-9]+/", ""))
  service_url               = "https://${local.service_api_function_name}.azurewebsites.net"
  auth_type                 = "McmaApiKey"
}

resource "local_sensitive_file" "api_handler" {
  filename = ".terraform/${filesha256(local.service_api_zip_file)}.zip"
  source   = local.service_api_zip_file
}

resource "azurerm_windows_function_app" "api_handler" {
  name                = local.service_api_function_name
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location

  storage_account_name       = var.app_storage_account.name
  storage_account_access_key = var.app_storage_account.primary_access_key
  service_plan_id            = var.app_service_plan.id

  site_config {
    application_stack {
      node_version = "~18"
    }

    application_insights_connection_string = var.app_insights.connection_string
    application_insights_key               = var.app_insights.instrumentation_key
  }

  identity {
    type = "SystemAssigned"
  }

  https_only      = true
  zip_deploy_file = local_sensitive_file.api_handler.filename

  app_settings = {
    WEBSITE_RUN_FROM_PACKAGE = "1"

    MCMA_PUBLIC_URL = local.service_url

    MCMA_SERVICE_REGISTRY_URL       = var.service_registry.service_url
    MCMA_SERVICE_REGISTRY_AUTH_TYPE = var.service_registry.auth_type

    MCMA_TABLE_NAME            = azurerm_cosmosdb_sql_container.service.name
    MCMA_COSMOS_DB_DATABASE_ID = local.cosmosdb_database_name
    MCMA_COSMOS_DB_ENDPOINT    = var.cosmosdb_account.endpoint
    MCMA_COSMOS_DB_KEY         = var.cosmosdb_account.primary_key
    MCMA_COSMOS_DB_REGION      = var.resource_group.location

    MCMA_KEY_VAULT_URL                     = azurerm_key_vault.service.vault_uri
    MCMA_API_KEY_SECRET_ID                 = azurerm_key_vault_secret.api_key.name
    MCMA_API_KEY_SECURITY_CONFIG_SECRET_ID = azurerm_key_vault_secret.api_key_security_config.name
    MCMA_API_KEY_SECURITY_CONFIG_HASH      = sha256(azurerm_key_vault_secret.api_key_security_config.value)

    MCMA_WORKER_FUNCTION_ID = azurerm_storage_queue.worker.id
  }
}
