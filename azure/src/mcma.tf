resource "mcma_service" "service" {
  depends_on = [
  ]

  name = var.name
  auth_type = "McmaApiKey"

  dynamic "resource" {
    for_each = concat([
      "AmeJob", "AIJob", "CaptureJob", "DistributionJob", "QAJob", "TransferJob", "TransformJob", "WorkflowJob"
    ], var.custom_job_types)
    content {
      resource_type = resource.value
      http_endpoint = "${local.service_url}/jobs"
    }
  }
}
