#################################
# Lambda periodic_job_checker
#################################

locals {
  lambda_name_periodic_job_checker = format("%.64s", replace("${var.prefix}-periodic-job-checker", "/[^a-zA-Z0-9_]+/", "-" ))
}

resource "aws_iam_role" "periodic_job_checker" {
  name = format("%.64s", replace("${var.prefix}-${var.aws_region}-periodic-job-checker", "/[^a-zA-Z0-9_]+/", "-" ))
  path = var.iam_role_path

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

resource "aws_iam_role_policy" "periodic_job_checker" {
  name = aws_iam_role.periodic_job_checker.name
  role = aws_iam_role.periodic_job_checker.id

  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = concat([
      {
        Sid      = "DescribeCloudWatchLogs"
        Effect   = "Allow"
        Action   = "logs:DescribeLogGroups"
        Resource = "*"
      },
      {
        Sid      = "WriteToCloudWatchLogs"
        Effect   = "Allow"
        Action   = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        Resource = concat([
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:${var.log_group.name}:*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/${local.lambda_name_periodic_job_checker}:*",
        ], var.enhanced_monitoring_enabled ? [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda-insights:*"
        ] : [])
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
        Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${local.lambda_name_worker}"
      },
      {
        Sid      = "AllowEnablingDisabling"
        Effect   = "Allow",
        Action   = ["events:EnableRule", "events:DisableRule"],
        Resource = aws_cloudwatch_event_rule.periodic_job_checker_trigger.arn
      },
    ],
    var.xray_tracing_enabled ?
    [
      {
        Sid      = "AllowLambdaWritingToXRay"
        Effect   = "Allow",
        Action   = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ],
        Resource = "*"
      }
    ] : [])
  })
}


resource "aws_lambda_function" "periodic_job_checker" {
  depends_on = [
    aws_iam_role_policy.periodic_job_checker
  ]

  filename         = "${path.module}/lambdas/periodic-job-checker.zip"
  function_name    = local.lambda_name_periodic_job_checker
  role             = aws_iam_role.periodic_job_checker.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambdas/periodic-job-checker.zip")
  runtime          = "nodejs14.x"
  timeout          = "900"
  memory_size      = "2048"

  layers = var.enhanced_monitoring_enabled ? ["arn:aws:lambda:${var.aws_region}:580247275435:layer:LambdaInsightsExtension:14"] : []

  environment {
    variables = {
      LogGroupName               = var.log_group.name
      TableName                  = aws_dynamodb_table.service_table.name
      PublicUrl                  = local.service_url
      ServicesUrl                = var.service_registry.services_url
      ServicesAuthType           = var.service_registry.auth_type
      CloudWatchEventRule        = aws_cloudwatch_event_rule.periodic_job_checker_trigger.name,
      DefaultJobTimeoutInMinutes = var.default_job_timeout_in_minutes
      WorkerFunctionId           = local.lambda_name_worker
    }
  }

  tracing_config {
    mode = var.xray_tracing_enabled ? "Active" : "PassThrough"
  }

  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "periodic_job_checker_trigger" {
  name                = format("%.64s", "${var.prefix}-periodic-job-checker-trigger")
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
