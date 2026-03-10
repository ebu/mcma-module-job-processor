terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.63.0"
    }
    mcma = {
      source  = "ebu/mcma"
      version = ">= 0.0.27"
    }
    azapi = {
      source  = "Azure/azapi"
      version = ">= 2.7.0"
    }
  }
}
