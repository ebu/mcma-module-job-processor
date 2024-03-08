######################
# App Service Plan
######################

resource "azurerm_service_plan" "app_service_plan" {
  count               = var.app_service_plan == null ? 1 : 0
  name                = var.prefix
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location
  os_type             = "Windows"
  sku_name            = "Y1"

  tags = var.tags
}

locals {
  app_service_plan_id = var.app_service_plan != null ? var.app_service_plan.id : azurerm_service_plan.app_service_plan[0].id
}
