output "auth_type" {
  value = local.service_auth_type
}

output "jobs_url" {
  value = "${local.service_url}/jobs"
}

output "service_definition" {
  value = {
    name        = var.name
    auth_type    = local.service_auth_type
    resources   = concat([
      {
        resource_type = "AmeJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "AIJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "CaptureJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "DistributionJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "QAJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "TransferJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "TransformJob"
        http_endpoint = "${local.service_url}/jobs"
      },
      {
        resource_type = "WorkflowJob"
        http_endpoint = "${local.service_url}/jobs"
      }
    ], [for job_type in var.custom_job_types : {
      resource_type = job_type
      http_endpoint = "${local.service_url}/jobs"
    }]),
    job_profiles = []
  }
}

output "aws_iam_role" {
  value = {
    lambda_execution: aws_iam_role.lambda_execution
  }
}

output "aws_iam_policy" {
  value = {
    lambda_execution: aws_iam_policy.lambda_execution
  }
}

output "aws_iam_role_policy_attachment" {
  value = {
    lambda_execution: aws_iam_role_policy_attachment.lambda_execution
  }
}

output "aws_dynamodb_table" {
  value = {
    service_table: aws_dynamodb_table.service_table
  }
}

output "aws_lambda_function" {
  value = {
    api_handler: aws_lambda_function.api_handler
    periodic_job_checker: aws_lambda_function.periodic_job_checker
    periodic_job_cleanup: aws_lambda_function.periodic_job_cleanup
    worker: aws_lambda_function.worker
  }
}

output "aws_cloudwatch_event_rule" {
  value = {
    periodic_job_checker_trigger: aws_cloudwatch_event_rule.periodic_job_checker_trigger
    periodic_job_cleanup_trigger: aws_cloudwatch_event_rule.periodic_job_cleanup_trigger
  }
}

output "aws_lambda_permission" {
  value = {
    periodic_job_checker_trigger: aws_lambda_permission.periodic_job_checker_trigger
    periodic_job_cleanup_trigger: aws_lambda_permission.periodic_job_cleanup_trigger
    service_api_default: aws_lambda_permission.service_api_default
    service_api_options: aws_lambda_permission.service_api_options
  }
}

output "aws_cloudwatch_event_target" {
  value = {
    periodic_job_checker_trigger: aws_cloudwatch_event_target.periodic_job_checker_trigger
    periodic_job_cleanup_trigger: aws_cloudwatch_event_target.periodic_job_cleanup_trigger
  }
}

output "aws_apigatewayv2_api" {
  value = {
    service_api: aws_apigatewayv2_api.service_api
  }
}

output "aws_apigatewayv2_integration" {
  value = {
    service_api: aws_apigatewayv2_integration.service_api
  }
}

output "aws_apigatewayv2_route" {
  value = {
    service_api_default: aws_apigatewayv2_route.service_api_default
    service_api_options: aws_apigatewayv2_route.service_api_options
  }
}

output "aws_apigatewayv2_stage" {
  value = {
    service_api: aws_apigatewayv2_stage.service_api
  }
}

output "aws_cloudwatch_log_metric_filter" {
  value = {
    jobs_started: aws_cloudwatch_log_metric_filter.jobs_started
    jobs_completed: aws_cloudwatch_log_metric_filter.jobs_completed
    jobs_failed: aws_cloudwatch_log_metric_filter.jobs_failed
    jobs_canceled: aws_cloudwatch_log_metric_filter.jobs_canceled
  }
}

output "aws_cloudwatch_dashboard" {
  value = {
    dashboard: aws_cloudwatch_dashboard.dashboard
  }
}
