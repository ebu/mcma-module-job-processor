######################
# App Service Plan
######################

resource "azurerm_service_plan" "app_service_plan_main" {
  count               = var.app_service_plan == null ? 1 : 0
  name                = var.prefix
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location
  os_type             = "Windows"
  sku_name            = "Y1"

  tags = var.tags
}

resource "azurerm_service_plan" "app_service_plan_api" {
  count               = var.app_service_plan == null ? 1 : 0
  name                = "${var.prefix}-worker"
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location
  os_type             = "Windows"
  sku_name            = "Y1"

  tags = var.tags
}

resource "azurerm_service_plan" "app_service_plan_worker" {
  count               = var.app_service_plan == null ? 1 : 0
  name                = "${var.prefix}-worker"
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location
  os_type             = "Windows"
  sku_name            = "Y1"

  tags = var.tags
}

locals {
  main_app_service_plan_id = var.app_service_plan != null ? var.app_service_plan.id : azurerm_service_plan.app_service_plan_main[0].id
  api_app_service_plan_id = var.app_service_plan != null ? var.app_service_plan.id : azurerm_service_plan.app_service_plan_api[0].id
  worker_app_service_plan_id = var.app_service_plan != null ? var.app_service_plan.id : azurerm_service_plan.app_service_plan_worker[0].id
}
