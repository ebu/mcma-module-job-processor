resource "aws_cloudwatch_log_metric_filter" "jobs_started" {
  name           = "${var.dashboard_name}-type-JOB_START"
  pattern        = "{ $.type = \"JOB_START\" }"
  log_group_name = var.log_group.name

  metric_transformation {
    name          = "JobsStarted"
    namespace     = var.dashboard_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "jobs_completed" {
  name           = "${var.dashboard_name}-message-jobStatus-Completed"
  pattern        = "{ $.type = \"JOB_END\" && $.message.jobStatus = \"Completed\" }"
  log_group_name = var.log_group.name

  metric_transformation {
    name          = "JobsCompleted"
    namespace     = var.dashboard_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "jobs_failed" {
  name           = "${var.dashboard_name}-message-jobStatus-Failed"
  pattern        = "{ $.type = \"JOB_END\" && $.message.jobStatus = \"Failed\" }"
  log_group_name = var.log_group.name

  metric_transformation {
    name          = "JobsFailed"
    namespace     = var.dashboard_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "jobs_canceled" {
  name           = "${var.dashboard_name}-message-jobStatus-Canceled"
  pattern        = "{ $.type = \"JOB_END\" && $.message.jobStatus = \"Canceled\" }"
  log_group_name = var.log_group.name

  metric_transformation {
    name          = "JobsCanceled"
    namespace     = var.dashboard_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_dashboard" "dashboard" {
  dashboard_name = "${var.dashboard_name}-${var.aws_region}"
  dashboard_body = templatefile("${path.module}/dashboard.json", {
    aws_region     = var.aws_region
    dashboard_name = var.dashboard_name
    log_group_name = var.log_group.name
  })
}
