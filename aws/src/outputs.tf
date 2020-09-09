output "auth_type" {
  value = local.service_auth_type
}

output "jobs_url" {
  value = "${local.service_url}/jobs"
}

output "table_stream_arn" {
  value = aws_dynamodb_table.service_table.stream_arn
}
