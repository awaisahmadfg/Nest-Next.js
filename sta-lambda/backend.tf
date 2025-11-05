terraform {
  # Remote state backend: stores Terraform state in S3
  backend "s3" {
    bucket         = ""         # e.g., smarttags-tf-state-prod
    key            = "sta-lambda/terraform.tfstate" # state file path inside the bucket
    region         = "us-east-1"                    # S3 bucket region
    # Optional but recommended: enable state locking with DynamoDB
    dynamodb_table = ""         # e.g., smarttags-tf-locks
    encrypt        = true
  }
}
