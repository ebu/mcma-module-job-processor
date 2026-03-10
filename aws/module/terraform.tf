terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.35.1"
    }
    mcma = {
      source  = "ebu/mcma"
      version = ">= 0.0.27"
    }
  }
}
