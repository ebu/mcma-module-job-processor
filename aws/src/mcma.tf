resource "mcma_service" "service" {
  depends_on = [
    aws_apigatewayv2_api.service_api,
    aws_apigatewayv2_integration.service_api,
    aws_apigatewayv2_route.service_api_default,
    aws_apigatewayv2_route.service_api_options,
    aws_apigatewayv2_stage.service_api,
    aws_dynamodb_table.service_table,
    aws_iam_role.api_handler,
    aws_iam_role_policy.api_handler,
    aws_lambda_function.api_handler,
    aws_lambda_permission.service_api_default,
    aws_lambda_permission.service_api_options,
  ]

  name      = var.name
  auth_type = local.service_auth_type

  dynamic "resource" {
    for_each = concat(["AmeJob", "AIJob", "CaptureJob", "DistributionJob", "QAJob", "TransferJob", "TransformJob", "WorkflowJob"], var.custom_job_types)
    content {
      resource_type = resource.value
      http_endpoint = "${local.service_url}/jobs"
    }
  }
}
