locals {
  job_cleanup_zip_file      = "${path.module}/functions/job-cleanup.zip"
  job_cleanup_function_name = format("%.32s", replace("${var.prefix}jobcleanup${var.resource_group.location}", "/[^a-z0-9]+/", ""))
}

resource "local_sensitive_file" "job_cleanup" {
  filename = ".terraform/${filesha256(local.job_cleanup_zip_file)}.zip"
  source   = local.job_cleanup_zip_file
}

resource "azurerm_windows_function_app" "job_cleanup" {
  name                = local.job_cleanup_function_name
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location

  storage_account_name       = var.app_storage_account.name
  storage_account_access_key = var.app_storage_account.primary_access_key
  service_plan_id            = local.main_app_service_plan_id

  site_config {
    application_stack {
      node_version = "~18"
    }

    elastic_instance_minimum = var.function_elastic_instance_minimum

    application_insights_connection_string = var.app_insights.connection_string
    application_insights_key               = var.app_insights.instrumentation_key
  }

  identity {
    type = "SystemAssigned"
  }

  https_only      = true
  zip_deploy_file = local_sensitive_file.job_cleanup.filename

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

    MCMA_WORKER_FUNCTION_ID = azurerm_storage_queue.worker.id

    JOB_RETENTION_PERIOD_IN_DAYS = var.job_retention_period_in_days
  }

  tags = var.tags
}
