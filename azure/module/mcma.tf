resource "mcma_service" "service" {
  depends_on = [
    azapi_resource.function_app,
    azurerm_cosmosdb_sql_database.service,
    azurerm_cosmosdb_sql_container.service,
    azurerm_key_vault.service,
    azurerm_key_vault_access_policy.deployment,
    azurerm_key_vault_access_policy.function_app,
    azurerm_key_vault_secret.api_key,
    azurerm_key_vault_secret.api_key_security_config,
    azurerm_role_assignment.function_app,
    azurerm_role_assignment.queue,
    azurerm_service_plan.service_plan,
    azurerm_storage_container.function_app,
    azurerm_storage_queue.queue,
    azurerm_storage_blob.function_app,
    azurerm_windows_function_app.function_app,
  ]

  name      = var.name
  auth_type = "McmaApiKey"

  dynamic "resource" {
    for_each = concat([
      "AmeJob", "AIJob", "CaptureJob", "DistributionJob", "QAJob", "StorageJob", "TransformJob", "WorkflowJob"
    ], var.custom_job_types)
    content {
      resource_type = resource.value
      http_endpoint = "${local.service_url}/jobs"
    }
  }
}
