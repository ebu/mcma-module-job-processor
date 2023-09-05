#################################
# Lambda job_cleanup
#################################

locals {
  lambda_name_job_cleanup = format("%.64s", replace("${var.prefix}-job-cleanup", "/[^a-zA-Z0-9_]+/", "-" ))
}

resource "aws_iam_role" "job_cleanup" {
  name = format("%.64s", replace("${var.prefix}-${var.aws_region}-job-cleanup", "/[^a-zA-Z0-9_]+/", "-" ))
  path = var.iam_role_path

  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowLambdaAssumingRole"
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  permissions_boundary = var.iam_permissions_boundary

  tags = var.tags
}

resource "aws_iam_role_policy" "job_cleanup" {
  name = aws_iam_role.job_cleanup.name
  role = aws_iam_role.job_cleanup.id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = concat([
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
        ],
        Resource = concat([
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${var.log_group.name}:*",
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.lambda_name_job_cleanup}:*",
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
    ],
      var.xray_tracing_enabled ?
      [
        {
          Sid    = "AllowLambdaWritingToXRay"
          Effect = "Allow"
          Action = [
            "xray:PutTraceSegments",
            "xray:PutTelemetryRecords",
          ]
          Resource = "*"
        }
      ] : [],
      var.dead_letter_config_target != null ?
      [
        {
          Effect   = "Allow"
          Action   = "sqs:SendMessage"
          Resource = var.dead_letter_config_target
        }
      ] : [])
  })
}


resource "aws_lambda_function" "job_cleanup" {
  depends_on = [
    aws_iam_role_policy.job_cleanup
  ]

  filename         = "${path.module}/lambdas/job-cleanup.zip"
  function_name    = local.lambda_name_job_cleanup
  role             = aws_iam_role.job_cleanup.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/job-cleanup.zip")
  runtime          = "nodejs18.x"
  timeout          = "900"
  memory_size      = "2048"

  layers = var.enhanced_monitoring_enabled && contains(keys(local.lambda_insights_extensions), var.aws_region) ? [
    local.lambda_insights_extensions[var.aws_region]
  ] : []

  environment {
    variables = {
      MCMA_LOG_GROUP_NAME             = var.log_group.name
      MCMA_TABLE_NAME                 = aws_dynamodb_table.service_table.name
      MCMA_PUBLIC_URL                 = local.service_url
      MCMA_SERVICE_REGISTRY_URL       = var.service_registry.service_url
      MCMA_SERVICE_REGISTRY_AUTH_TYPE = var.service_registry.auth_type
      MCMA_WORKER_FUNCTION_ID         = local.lambda_name_worker
      JOB_RETENTION_PERIOD_IN_DAYS    = var.job_retention_period_in_days
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "job_cleanup_trigger" {
  name                = format("%.64s", "${var.prefix}-job-cleanup-trigger")
  schedule_expression = "cron(0 0 * * ? *)"
  is_enabled          = true

  tags = var.tags
}

resource "aws_lambda_permission" "job_cleanup_trigger" {
  statement_id  = "AllowInvocationFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.job_cleanup.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.job_cleanup_trigger.arn
}

resource "aws_cloudwatch_event_target" "job_cleanup_trigger" {
  arn  = aws_lambda_function.job_cleanup.arn
  rule = aws_cloudwatch_event_rule.job_cleanup_trigger.name
}
