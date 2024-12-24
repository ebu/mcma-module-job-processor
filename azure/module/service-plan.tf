######################
# Service Plan
######################

resource "azurerm_service_plan" "service_plan" {
  count               = var.use_flex_consumption_plan || var.service_plan == null ? 1 : 0
  name                = var.prefix
  resource_group_name = var.resource_group.name
  location            = var.resource_group.location
  os_type             = var.use_flex_consumption_plan ? "Linux" : "Windows"
  sku_name            = var.use_flex_consumption_plan ? "FC1" : "Y1"

  tags = var.tags
}

locals {
  service_plan_id = length(azurerm_service_plan.service_plan) == 0 ? var.service_plan.id : var.use_flex_consumption_plan ? replace(azurerm_service_plan.service_plan[0].id, "Microsoft.Web/serverFarms", "Microsoft.Web/serverfarms") : azurerm_service_plan.service_plan[0].id
}
