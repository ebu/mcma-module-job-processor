##############################
# API Gateway
##############################

resource "aws_apigatewayv2_api" "service_api" {
  name          = var.prefix
  description   = "Job Processor Rest Api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token"]
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "service_api" {
  api_id                 = aws_apigatewayv2_api.service_api.id
  connection_type        = "INTERNET"
  integration_method     = "POST"
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api_handler.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "service_api_options" {
  count = var.api_security_auth_type == "AWS4" ? 1 : 0

  api_id             = aws_apigatewayv2_api.service_api.id
  route_key          = "OPTIONS /{proxy+}"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.service_api.id}"
}

resource "aws_lambda_permission" "service_api_options" {
  count = var.api_security_auth_type == "AWS4" ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayOptions"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.service_api.execution_arn}/*/*/{proxy+}"
}

resource "aws_apigatewayv2_route" "service_api_default" {
  api_id             = aws_apigatewayv2_api.service_api.id
  route_key          = "$default"
  authorization_type = var.api_security_auth_type == "AWS4" ? "AWS_IAM" : "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.service_api.id}"
}

resource "aws_lambda_permission" "service_api_default" {
  statement_id  = "AllowExecutionFromAPIGatewayDefault"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.service_api.execution_arn}/*/$default"
}

resource "aws_apigatewayv2_stage" "service_api" {
  depends_on = [
    aws_apigatewayv2_route.service_api_options,
    aws_apigatewayv2_route.service_api_default
  ]

  api_id      = aws_apigatewayv2_api.service_api.id
  name        = coalesce(var.stage_name, "$default")
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = var.api_gateway_metrics_enabled
    throttling_burst_limit   = 5000
    throttling_rate_limit    = 10000
  }

  access_log_settings {
    destination_arn = var.log_group.arn
    format          = "{ \"requestId\":\"$context.requestId\", \"ip\": \"$context.identity.sourceIp\", \"requestTime\":\"$context.requestTime\", \"httpMethod\":\"$context.httpMethod\", \"routeKey\":\"$context.routeKey\", \"path\":\"$context.path\", \"status\":\"$context.status\",\"protocol\":\"$context.protocol\", \"responseLength\":\"$context.responseLength\" }"
  }

  tags = var.tags
}

locals {
  service_url = var.stage_name == null ? aws_apigatewayv2_api.service_api.api_endpoint : "${aws_apigatewayv2_api.service_api.api_endpoint}/${var.stage_name}"
}
