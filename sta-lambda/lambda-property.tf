# Property Creation Lambda Function
# Handles: Pinata upload + Blockchain registration
module "property_creation_lambda" {
  source = "./modules/lambda"

  function_name    = "sta-lambda-propertyCreation"
  handler         = "handler.propertyCreationHandler"
  runtime         = "nodejs18.x"
  memory_size     = 1536  # Higher memory for blockchain operations
  timeout         = 300   # 5 minutes for blockchain transactions
  description     = "Property creation workflow: Pinata upload + Blockchain registration"
  source_code_path = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  iam_role_arn    = aws_iam_role.lambda_role.arn

  # Property-specific environment variables
  environment_variables = {
    NODE_ENV                    = var.environment
    FUNCTION_NAME               = "propertyCreation"
    INFURA_RPC_URL              = var.infura_rpc_url
    MASTER_WALLET_PRIVATE_KEY   = var.master_wallet_private_key
    SMART_TAGS_CONTRACT_ADDRESS = var.smart_tags_contract_address
    PINATA_API_KEY              = var.pinata_api_key
    PINATA_SECRET_API_KEY       = var.pinata_secret_api_key
    WEBSITE_URL                 = var.website_url
  }

  tags = merge(local.tags, {
    Service = "property-creation"
    Dependencies = "pinata,blockchain"
  })
}

