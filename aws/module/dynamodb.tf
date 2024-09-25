######################
# DynamoDB
######################

resource "aws_dynamodb_table" "service_table" {
  name         = var.prefix
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "resource_pkey"
  range_key    = "resource_skey"

  attribute {
    name = "resource_pkey"
    type = "S"
  }

  attribute {
    name = "resource_skey"
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
