locals {
  function_app_zip_file = "${path.module}/function-app.zip"
  function_app_name     = format("%.32s", replace("${var.prefix}${var.resource_group.location}", "/[^a-z0-9]+/", ""))
  service_fqdn          = "${local.function_app_name}.azurewebsites.net"
  service_url           = "https://${local.service_fqdn}"
  auth_type             = "McmaApiKey"

  storage_container_url = var.use_flex_consumption_plan ? "${var.storage_account.primary_blob_endpoint}${azurerm_storage_container.function_app[0].name}" : ""
}

resource "local_sensitive_file" "function_app" {
  filename = ".terraform/${filesha256(local.function_app_zip_file)}.zip"
  source   = local.function_app_zip_file
}

resource "azurerm_storage_container" "function_app" {
  count = var.use_flex_consumption_plan ? 1 : 0

  name                  = var.prefix
  storage_account_id    = var.storage_account.id
  container_access_type = "private"
}

resource "azurerm_storage_blob" "function_app" {
  count = var.use_flex_consumption_plan ? 1 : 0

  name                   = "released-package.zip"
  storage_account_name   = var.storage_account.name
  storage_container_name = azurerm_storage_container.function_app[0].name
  type                   = "Block"
  source                 = local_sensitive_file.function_app.filename
}

resource "azapi_resource" "function_app" {
  count = var.use_flex_consumption_plan ? 1 : 0

  depends_on = [
    local_sensitive_file.function_app
  ]

  type      = "Microsoft.Web/sites@2024-04-01"
  location  = var.resource_group.location
  name      = local.function_app_name
  parent_id = var.resource_group.id
  body = {
    kind = "functionapp,linux"
    identity = {
      type = "SystemAssigned"
    }
    properties = {
      functionAppConfig = {
        deployment = {
          storage = {
            type  = "blobcontainer"
            value = local.storage_container_url
            authentication = {
              type = "systemassignedidentity"
            }
          }
        }
        runtime = {
          name    = "node"
          version = "20"
        }
        scaleAndConcurrency = {
          instanceMemoryMB     = 2048
          maximumInstanceCount = 100
        }
      }
      httpsOnly    = true
      serverFarmId = local.service_plan_id
      siteConfig = {
        appSettings = [
          {
            name  = "AzureWebJobsStorage"
            value = var.storage_account.primary_connection_string
          },
          {
            name  = "FUNCTION_CODE_HASH"
            value = filesha256(local.function_app_zip_file)
          },
          {
            name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
            value = var.app_insights.connection_string
          },
          {
            name  = "MCMA_PUBLIC_URL",
            value = local.service_url
          },
          {
            name  = "MCMA_SERVICE_REGISTRY_URL",
            value = var.service_registry.service_url
          },
          {
            name  = "MCMA_SERVICE_REGISTRY_AUTH_TYPE",
            value = var.service_registry.auth_type
          },
          {
            name  = "MCMA_TABLE_NAME",
            value = azurerm_cosmosdb_sql_container.service.name
          },
          {
            name  = "MCMA_COSMOS_DB_DATABASE_ID",
            value = local.cosmosdb_database_name
          },
          {
            name  = "MCMA_COSMOS_DB_ENDPOINT",
            value = var.cosmosdb_account.endpoint
          },
          {
            name  = "MCMA_COSMOS_DB_KEY",
            value = var.cosmosdb_account.primary_key
          },
          {
            name  = "MCMA_COSMOS_DB_REGION",
            value = var.resource_group.location
          },
          {
            name  = "MCMA_KEY_VAULT_URL",
            value = azurerm_key_vault.service.vault_uri
          },
          {
            name  = "MCMA_API_KEY_SECRET_ID",
            value = azurerm_key_vault_secret.api_key.name
          },
          {
            name  = "MCMA_API_KEY_SECURITY_CONFIG_SECRET_ID",
            value = azurerm_key_vault_secret.api_key_security_config.name
          },
          {
            name  = "MCMA_API_KEY_SECURITY_CONFIG_HASH",
            value = sha256(azurerm_key_vault_secret.api_key_security_config.value)
          },
          {
            name  = "WORKER_QUEUE_NAME",
            value = azurerm_storage_queue.queue.name
          },
          {
            name  = "MCMA_WORKER_FUNCTION_ID",
            value = azurerm_storage_queue.queue.id
          },
          {
            name  = "DEFAULT_JOB_TIMEOUT_IN_MINUTES",
            value = tostring(var.default_job_timeout_in_minutes)
          },
          {
            name  = "JOB_RETENTION_PERIOD_IN_DAYS",
            value = tostring(var.job_retention_period_in_days)
          },
        ]
      }
      virtualNetworkSubnetId = var.virtual_network_subnet_id
    }
  }
}

resource "azurerm_role_assignment" "function_app" {
  count = var.use_flex_consumption_plan ? 1 : 0

  scope                = var.storage_account.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azapi_resource.function_app[0].output.identity.principalId
}

resource "azurerm_windows_function_app" "function_app" {
  count = var.use_flex_consumption_plan ? 0 : 1

  name                = local.function_app_name
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location

  storage_account_name       = var.storage_account.name
  storage_account_access_key = var.storage_account.primary_access_key
  service_plan_id            = local.service_plan_id

  builtin_logging_enabled = false

  site_config {
    application_stack {
      node_version = "~20"
    }

    elastic_instance_minimum               = var.function_elastic_instance_minimum
    application_insights_connection_string = var.app_insights.connection_string
  }

  identity {
    type = "SystemAssigned"
  }

  https_only      = true
  zip_deploy_file = local_sensitive_file.function_app.filename

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

    WORKER_QUEUE_NAME       = azurerm_storage_queue.queue.name
    MCMA_WORKER_FUNCTION_ID = azurerm_storage_queue.queue.id

    DEFAULT_JOB_TIMEOUT_IN_MINUTES = var.default_job_timeout_in_minutes
    JOB_RETENTION_PERIOD_IN_DAYS   = var.job_retention_period_in_days
  }

  tags = var.tags
}

resource "azurerm_key_vault_access_policy" "function_app" {
  key_vault_id = azurerm_key_vault.service.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = var.use_flex_consumption_plan ? azapi_resource.function_app[0].output.identity.principalId : azurerm_windows_function_app.function_app[0].identity[0].principal_id

  secret_permissions = ["Get"]
}

resource "azurerm_storage_queue" "queue" {
  name                 = "${var.prefix}-worker"
  storage_account_name = var.storage_account.name
}

resource "azurerm_role_assignment" "queue" {
  scope                = azurerm_storage_queue.queue.resource_manager_id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = var.use_flex_consumption_plan ? azapi_resource.function_app[0].output.identity.principalId : azurerm_windows_function_app.function_app[0].identity[0].principal_id
}
