output "auth_type" {
  value = var.api_security_auth_type
}

output "service_url" {
  depends_on = [mcma_service.service]
  value      = local.service_url
}

output "api_key" {
  sensitive = true
  value     = random_password.api_key.result
}

output "aws_iam_role" {
  value = {
    api_handler = aws_iam_role.api_handler
    job_checker = aws_iam_role.job_checker
    job_cleanup = aws_iam_role.job_cleanup
    worker      = aws_iam_role.worker
  }
}

output "aws_iam_role_policy" {
  value = {
    api_handler = aws_iam_role_policy.api_handler
    job_checker = aws_iam_role_policy.job_checker
    job_cleanup = aws_iam_role_policy.job_cleanup
    worker      = aws_iam_role_policy.worker
  }
}

output "aws_dynamodb_table" {
  value = {
    service_table = aws_dynamodb_table.service_table
  }
}

output "aws_lambda_function" {
  value = {
    api_handler = aws_lambda_function.api_handler
    job_checker = aws_lambda_function.job_checker
    job_cleanup = aws_lambda_function.job_cleanup
    worker      = aws_lambda_function.worker
  }
}

output "aws_cloudwatch_event_rule" {
  value = {
    job_checker_trigger = aws_cloudwatch_event_rule.job_checker_trigger
    job_cleanup_trigger = aws_cloudwatch_event_rule.job_cleanup_trigger
  }
}

output "aws_lambda_permission" {
  value = {
    job_checker_trigger = aws_lambda_permission.job_checker_trigger
    job_cleanup_trigger = aws_lambda_permission.job_cleanup_trigger
    service_api_default = aws_lambda_permission.service_api_default
    service_api_options = aws_lambda_permission.service_api_options
  }
}

output "aws_cloudwatch_event_target" {
  value = {
    job_checker_trigger = aws_cloudwatch_event_target.job_checker_trigger
    job_cleanup_trigger = aws_cloudwatch_event_target.job_cleanup_trigger
  }
}

output "aws_apigatewayv2_api" {
  value = {
    service_api = aws_apigatewayv2_api.service_api
  }
}

output "aws_apigatewayv2_integration" {
  value = {
    service_api = aws_apigatewayv2_integration.service_api
  }
}

output "aws_apigatewayv2_route" {
  value = {
    service_api_default = aws_apigatewayv2_route.service_api_default
    service_api_options = aws_apigatewayv2_route.service_api_options
  }
}

output "aws_apigatewayv2_stage" {
  value = {
    service_api = aws_apigatewayv2_stage.service_api
  }
}

output "aws_cloudwatch_log_metric_filter" {
  value = {
    jobs_started   = aws_cloudwatch_log_metric_filter.jobs_started
    jobs_completed = aws_cloudwatch_log_metric_filter.jobs_completed
    jobs_failed    = aws_cloudwatch_log_metric_filter.jobs_failed
    jobs_canceled  = aws_cloudwatch_log_metric_filter.jobs_canceled
  }
}

output "aws_cloudwatch_dashboard" {
  value = {
    dashboard = aws_cloudwatch_dashboard.dashboard
  }
}

output "aws_secretsmanager_secret" {
  value = {
    api_key                 = aws_secretsmanager_secret.api_key
    api_key_security_config = aws_secretsmanager_secret.api_key_security_config
  }
}

output "aws_secretsmanager_secret_version" {
  value = {
    api_key                 = aws_secretsmanager_secret_version.api_key
    api_key_security_config = aws_secretsmanager_secret_version.api_key_security_config
  }
}
