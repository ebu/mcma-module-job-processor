resource "random_password" "deployment_api_key" {
  length  = 32
  special = false
}
