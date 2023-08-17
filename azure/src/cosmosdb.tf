resource "azurerm_cosmosdb_sql_database" "service" {
  name                = var.prefix
  resource_group_name = var.resource_group.name
  account_name        = var.cosmosdb_account.name
  autoscale_settings {
    max_throughput = 1000
  }
}

resource "azurerm_cosmosdb_sql_container" "service" {
  name                = var.prefix
  resource_group_name = var.resource_group.name
  account_name        = var.cosmosdb_account.name
  database_name       = azurerm_cosmosdb_sql_database.service.name
  partition_key_path  = "/partitionKey"
}
