##############################
# Lambda api-handler
##############################

locals {
  lambda_name_api_handler = format("%.64s", replace("${var.prefix}-api-handler", "/[^a-zA-Z0-9_]+/", "-"))
}

resource "aws_iam_role" "api_handler" {
  name = format("%.64s", replace("${var.prefix}-${var.aws_region}-api-handler", "/[^a-zA-Z0-9_]+/", "-"))
  path = var.iam_role_path

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAssumingRole"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  permissions_boundary = var.iam_permissions_boundary

  tags = var.tags
}

resource "aws_iam_role_policy" "api_handler" {
  name = aws_iam_role.api_handler.name
  role = aws_iam_role.api_handler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "DescribeCloudWatchLogs"
          Effect   = "Allow"
          Action   = "logs:DescribeLogGroups"
          Resource = "*"
        },
        {
          Sid    = "WriteToCloudWatchLogs"
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ]
          Resource = concat([
            "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${var.log_group.name}:*",
            "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.lambda_name_api_handler}:*",
            ], var.enhanced_monitoring_enabled ? [
            "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda-insights:*",
          ] : [])
        },
        {
          Sid    = "ListAndDescribeDynamoDBTables"
          Effect = "Allow"
          Action = [
            "dynamodb:List*",
            "dynamodb:DescribeReservedCapacity*",
            "dynamodb:DescribeLimits",
            "dynamodb:DescribeTimeToLive",
          ],
          Resource = "*"
        },
        {
          Sid    = "AllowTableOperations"
          Effect = "Allow"
          Action = [
            "dynamodb:BatchGetItem",
            "dynamodb:BatchWriteItem",
            "dynamodb:DeleteItem",
            "dynamodb:DescribeTable",
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:UpdateItem",
          ]
          Resource = [
            aws_dynamodb_table.service_table.arn,
            "${aws_dynamodb_table.service_table.arn}/index/*",
          ]
        },
        {
          Sid      = "AllowInvokingWorkerLambda"
          Effect   = "Allow"
          Action   = "lambda:InvokeFunction"
          Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.lambda_name_worker}"
        },

        {
          Sid      = "AllowReadingApiKey"
          Effect   = "Allow"
          Action   = "secretsmanager:GetSecretValue"
          Resource = aws_secretsmanager_secret.api_key.arn
        },
      ],
      length(var.execute_api_arns) > 0 ?
      [
        {
          Sid      = "AllowInvokingApiGateway"
          Effect   = "Allow"
          Action   = "execute-api:Invoke"
          Resource = var.execute_api_arns
        }
      ] : [],
      var.api_security_auth_type == "McmaApiKey" ?
      [
        {
          Sid      = "AllowReadingApiKeySecurityConfig"
          Effect   = "Allow"
          Action   = "secretsmanager:GetSecretValue"
          Resource = aws_secretsmanager_secret.api_key_security_config[0].arn
        }
      ] : [],
      var.xray_tracing_enabled ?
      [
        {
          Sid    = "AllowLambdaWritingToXRay"
          Effect = "Allow"
          Action = [
            "xray:PutTraceSegments",
            "xray:PutTelemetryRecords",
            "xray:GetSamplingRules",
            "xray:GetSamplingTargets",
            "xray:GetSamplingStatisticSummaries",
          ],
          Resource = "*"
        }
    ] : [])
  })
}

resource "aws_lambda_function" "api_handler" {
  depends_on = [
    aws_iam_role_policy.api_handler
  ]

  filename         = "${path.module}/lambdas/api-handler.zip"
  function_name    = local.lambda_name_api_handler
  role             = aws_iam_role.api_handler.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/api-handler.zip")
  runtime          = "nodejs22.x"
  timeout          = "30"
  memory_size      = "2048"

  layers = var.enhanced_monitoring_enabled && contains(keys(local.lambda_insights_extensions), var.aws_region) ? [
    local.lambda_insights_extensions[var.aws_region]
  ] : []

  environment {
    variables = {
      MCMA_TABLE_NAME                        = aws_dynamodb_table.service_table.name
      MCMA_PUBLIC_URL                        = local.service_url
      MCMA_SERVICE_REGISTRY_URL              = var.service_registry.service_url
      MCMA_SERVICE_REGISTRY_AUTH_TYPE        = var.service_registry.auth_type
      MCMA_WORKER_FUNCTION_ID                = local.lambda_name_worker
      MCMA_API_KEY_SECRET_ID                 = aws_secretsmanager_secret.api_key.name
      MCMA_API_KEY_SECURITY_CONFIG_SECRET_ID = var.api_security_auth_type == "McmaApiKey" ? aws_secretsmanager_secret.api_key_security_config[0].name : ""
      MCMA_API_KEY_SECURITY_CONFIG_HASH      = var.api_security_auth_type == "McmaApiKey" ? sha256(aws_secretsmanager_secret_version.api_key_security_config[0].secret_string) : ""
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}
