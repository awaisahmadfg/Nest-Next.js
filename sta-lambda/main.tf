provider "aws" {
  region = var.region
}

# Data source for current AWS account
# - `data` = Read information (don't create anything)
# - Gets your AWS account ID
# - Gets current region
# - Like querying AWS for information
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}


# **What `locals` means:**
# - Like variables, but only used inside this file
# - Reusable values
# - `tags`: Labels for AWS resources (helps organize in AWS Console)

# **Why tags?**
# - In AWS Console, you can filter/search by tags
# - "Show me all resources for 'sta-lambda' project"
# - "Show me all resources in 'development' environment"
locals {
  function_name = var.function_name
  environment   = var.environment
  tags = {
    Environment = var.environment
    Project     = "sta-lambda"
    ManagedBy   = "Terraform"
  }
}



