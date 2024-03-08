resource "azurerm_cosmosdb_sql_database" "service" {
  count               = var.cosmosdb_database != null ? 0 : 1
  name                = var.prefix
  resource_group_name = var.resource_group.name
  account_name        = var.cosmosdb_account.name
}

locals {
  cosmosdb_database_name = var.cosmosdb_database != null ? var.cosmosdb_database.name : azurerm_cosmosdb_sql_database.service[0].name
}

resource "azurerm_cosmosdb_sql_container" "service" {
  name                = var.prefix
  resource_group_name = var.resource_group.name
  account_name        = var.cosmosdb_account.name
  database_name       = local.cosmosdb_database_name
  partition_key_path  = "/partitionKey"
}
