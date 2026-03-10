terraform {
  required_providers {
    mcma = {
      source  = "ebu/mcma"
      version = ">= 0.0.27"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "2.7.0"
    }
  }
}
