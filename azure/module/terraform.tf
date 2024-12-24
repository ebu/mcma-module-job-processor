terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.12.0"
    }
    mcma = {
      source  = "ebu/mcma"
      version = ">= 0.0.27"
    }
    azapi = {
      source  = "Azure/azapi"
      version = ">= 2.1.0"
    }
  }
}
