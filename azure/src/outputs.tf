output "auth_type" {
  value = local.auth_type
}

output "service_url" {
  depends_on = [mcma_service.service]
  value      = local.service_url
}

output "api_key" {
  sensitive = true
  value     = random_password.api_key.result
}
