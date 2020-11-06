##################################
# aws_iam_role + aws_iam_policy
##################################

resource "aws_iam_role" "lambda_execution" {
  name               = format("%.64s", "${var.module_prefix}.${var.aws_region}.lambda-execution")
  path               = var.iam_role_path
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowLambdaAssumingRole"
        Effect    = "Allow"
        Action    = "sts:AssumeRole",
        Principal = {
          "Service" = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_policy" "lambda_execution" {
  name        = format("%.128s", "${var.module_prefix}.${var.aws_region}.lambda-execution")
  description = "Policy to write to log"
  path        = var.iam_policy_path
  policy      = jsonencode({
    Version   = "2012-10-17",
    Statement = concat([
      {
        Sid      = "AllowLambdaWritingToLogs"
        Effect   = "Allow",
        Action   = "logs:*",
        Resource = "*"
      },
      {
        Sid      = "ListAndDescribeDynamoDBTables",
        Effect   = "Allow",
        Action   = [
          "dynamodb:List*",
          "dynamodb:DescribeReservedCapacity*",
          "dynamodb:DescribeLimits",
          "dynamodb:DescribeTimeToLive"
        ],
        Resource = "*"
      },
      {
        Sid      = "SpecificTable",
        Effect   = "Allow",
        Action   = [
          "dynamodb:BatchGet*",
          "dynamodb:DescribeStream",
          "dynamodb:DescribeTable",
          "dynamodb:Get*",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWrite*",
          "dynamodb:CreateTable",
          "dynamodb:Delete*",
          "dynamodb:Update*",
          "dynamodb:PutItem"
        ],
        Resource = [
          aws_dynamodb_table.service_table.arn,
          "${aws_dynamodb_table.service_table.arn}/index/*"
        ]
      },
      {
        Sid      = "AllowInvokingWorkerLambda",
        Effect   = "Allow",
        Action   = "lambda:InvokeFunction",
        Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${local.worker_lambda_name}"
      },
      {
        Sid      = "AllowInvokingApiGateway"
        Effect   = "Allow",
        Action   = "execute-api:Invoke",
        Resource = "arn:aws:execute-api:*:*:*"
      },
      {
        Sid      = "AllowEnablingDisabling"
        Effect   = "Allow",
        Action   = ["events:EnableRule", "events:DisableRule"],
        Resource = aws_cloudwatch_event_rule.periodic_job_checker_trigger.arn
      },
    ],
    var.xray_tracing_enabled ?
    [{
      Sid      = "AllowLambdaWritingToXRay"
      Effect   = "Allow",
      Action   = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      Resource = "*"
    }]: [],
    var.dead_letter_config_target != null ?
    [{
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: var.dead_letter_config_target
    }] : [])
  })
}

resource "aws_iam_role_policy_attachment" "lambda_execution" {
  role       = aws_iam_role.lambda_execution.id
  policy_arn = aws_iam_policy.lambda_execution.arn
}

######################
# aws_dynamodb_table
######################

resource "aws_dynamodb_table" "service_table" {
  name         = var.module_prefix
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "resource_pkey"
  range_key    = "resource_id"

  attribute {
    name = "resource_pkey"
    type = "S"
  }

  attribute {
    name = "resource_id"
    type = "S"
  }

  attribute {
    name = "resource_status"
    type = "S"
  }

  attribute {
    name = "resource_created"
    type = "N"
  }

  global_secondary_index {
    name            = "ResourceCreatedIndex"
    hash_key        = "resource_pkey"
    range_key       = "resource_created"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ResourceStatusIndex"
    hash_key        = "resource_status"
    range_key       = "resource_created"
    projection_type = "ALL"
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  tags = var.tags
}

#################################
#  aws_lambda_function : api_handler
#################################

resource "aws_lambda_function" "api_handler" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/api-handler.zip"
  function_name    = format("%.64s", replace("${var.module_prefix}-api-handler", "/[^a-zA-Z0-9_]+/", "-" ))
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/api-handler.zip")
  runtime          = "nodejs12.x"
  timeout          = "30"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName     = var.log_group.name
      TableName        = aws_dynamodb_table.service_table.name
      PublicUrl        = local.service_url
      ServicesUrl      = var.service_registry.services_url
      ServicesAuthType = var.service_registry.auth_type
      WorkerFunctionId = local.worker_lambda_name
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

#################################
#  aws_lambda_function : periodic_job_checker
#################################

resource "aws_lambda_function" "periodic_job_checker" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/periodic-job-checker.zip"
  function_name    = format("%.64s", replace("${var.module_prefix}-periodic-job-checker", "/[^a-zA-Z0-9_]+/", "-" ))
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/periodic-job-checker.zip")
  runtime          = "nodejs12.x"
  timeout          = "900"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName               = var.log_group.name
      TableName                  = aws_dynamodb_table.service_table.name
      PublicUrl                  = local.service_url
      ServicesUrl                = var.service_registry.services_url
      ServicesAuthType           = var.service_registry.auth_type
      CloudWatchEventRule        = aws_cloudwatch_event_rule.periodic_job_checker_trigger.name,
      DefaultJobTimeoutInMinutes = var.default_job_timeout_in_minutes
      WorkerFunctionId           = local.worker_lambda_name
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "periodic_job_checker_trigger" {
  name                = format("%.64s", "${var.module_prefix}-periodic-job-checker-trigger")
  schedule_expression = "cron(* * * * ? *)"

  lifecycle {
    ignore_changes = [is_enabled]
  }

  tags = var.tags
}

resource "aws_lambda_permission" "periodic_job_checker_trigger" {
  statement_id  = "AllowInvocationFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.periodic_job_checker.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.periodic_job_checker_trigger.arn
}

resource "aws_cloudwatch_event_target" "periodic_job_checker_trigger" {
  arn  = aws_lambda_function.periodic_job_checker.arn
  rule = aws_cloudwatch_event_rule.periodic_job_checker_trigger.name
}

#################################
#  aws_lambda_function : periodic_job_cleanup
#################################

resource "aws_lambda_function" "periodic_job_cleanup" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/periodic-job-cleanup.zip"
  function_name    = format("%.64s", replace("${var.module_prefix}-periodic-job-cleanup", "/[^a-zA-Z0-9_]+/", "-" ))
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/periodic-job-cleanup.zip")
  runtime          = "nodejs12.x"
  timeout          = "900"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName             = var.log_group.name
      TableName                = aws_dynamodb_table.service_table.name
      PublicUrl                = local.service_url
      ServicesUrl              = var.service_registry.services_url
      ServicesAuthType         = var.service_registry.auth_type
      JobRetentionPeriodInDays = var.job_retention_period_in_days
      WorkerFunctionId         = local.worker_lambda_name
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "periodic_job_cleanup_trigger" {
  name                = format("%.64s", "${var.module_prefix}-periodic-job-cleanup-trigger")
  schedule_expression = "cron(0 0 * * ? *)"
  is_enabled          = true

  tags = var.tags
}

resource "aws_lambda_permission" "periodic_job_cleanup_trigger" {
  statement_id  = "AllowInvocationFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.periodic_job_cleanup.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.periodic_job_cleanup_trigger.arn
}

resource "aws_cloudwatch_event_target" "periodic_job_cleanup_trigger" {
  arn  = aws_lambda_function.periodic_job_cleanup.arn
  rule = aws_cloudwatch_event_rule.periodic_job_cleanup_trigger.name
}

#################################
#  aws_lambda_function : worker
#################################

resource "aws_lambda_function" "worker" {
  depends_on = [
    aws_iam_role_policy_attachment.lambda_execution
  ]

  filename         = "${path.module}/lambdas/worker.zip"
  function_name    = local.worker_lambda_name
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/worker.zip")
  runtime          = "nodejs12.x"
  timeout          = "900"
  memory_size      = "3008"

  environment {
    variables = {
      LogGroupName        = var.log_group.name
      TableName           = aws_dynamodb_table.service_table.name
      PublicUrl           = local.service_url
      ServicesUrl         = var.service_registry.services_url
      ServicesAuthType    = var.service_registry.auth_type
      CloudWatchEventRule = aws_cloudwatch_event_rule.periodic_job_checker_trigger.name,
    }
  }

  dynamic "dead_letter_config" {
    for_each = var.dead_letter_config_target != null ? toset([1]) : toset([])

    content {
      target_arn = var.dead_letter_config_target
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

##############################
#  aws_apigatewayv2_api:  service_api
##############################

resource "aws_apigatewayv2_api" "service_api" {
  name          = var.module_prefix
  description   = "Job Processor Rest Api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token"]
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
  api_id             = aws_apigatewayv2_api.service_api.id
  route_key          = "OPTIONS /{proxy+}"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.service_api.id}"
}

resource "aws_lambda_permission" "service_api_options" {
  statement_id  = "AllowExecutionFromAPIGatewayOptions"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.service_api.execution_arn}/*/*/{proxy+}"
}

resource "aws_apigatewayv2_route" "service_api_default" {
  api_id             = aws_apigatewayv2_api.service_api.id
  route_key          = "$default"
  authorization_type = "AWS_IAM"
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
  name        = var.stage_name
  auto_deploy = true

  stage_variables = {

  }

  default_route_settings {
    data_trace_enabled       = var.xray_tracing_enabled
    detailed_metrics_enabled = var.api_gateway_metrics_enabled
    logging_level            = var.api_gateway_logging_enabled ? "INFO" : null
    throttling_burst_limit   = 5000
    throttling_rate_limit    = 10000
  }

  access_log_settings {
    destination_arn = var.log_group.arn
    format          = "{ \"requestId\":\"$context.requestId\", \"ip\": \"$context.identity.sourceIp\", \"requestTime\":\"$context.requestTime\", \"httpMethod\":\"$context.httpMethod\",\"routeKey\":\"$context.routeKey\", \"status\":\"$context.status\",\"protocol\":\"$context.protocol\", \"responseLength\":\"$context.responseLength\" }"
  }

  tags = var.tags
}

locals {
  service_url        = "${aws_apigatewayv2_api.service_api.api_endpoint}/${var.stage_name}"
  service_auth_type  = "AWS4"
  worker_lambda_name = format("%.64s", replace("${var.module_prefix}-worker", "/[^a-zA-Z0-9_]+/", "-" ))
}
