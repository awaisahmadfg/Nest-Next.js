# API Gateway REST API
resource "aws_api_gateway_rest_api" "api" {
  name        = var.api_gateway_name
  description = "API Gateway for sta-lambda property creation"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = local.tags
}

# API Gateway Resource
resource "aws_api_gateway_resource" "property_create" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "property"
}

resource "aws_api_gateway_resource" "property_create_create" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.property_create.id
  path_part   = "create"
}

# API Gateway Method
resource "aws_api_gateway_method" "property_create" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.property_create_create.id
  http_method   = var.api_method
  authorization = "NONE"
}

# CORS Options Method (if enabled)
resource "aws_api_gateway_method" "property_create_options" {
  count         = var.enable_cors ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.property_create_create.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# CORS Options Integration (if enabled)
resource "aws_api_gateway_integration" "property_create_options" {
  count         = var.enable_cors ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.property_create_create.id
  http_method   = aws_api_gateway_method.property_create_options[0].http_method
  type          = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# CORS Options Method Response (if enabled)
resource "aws_api_gateway_method_response" "property_create_options" {
  count       = var.enable_cors ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.property_create_create.id
  http_method = aws_api_gateway_method.property_create_options[0].http_method
  status_code = "200"

  response_headers = {
    "Access-Control-Allow-Headers" = true
    "Access-Control-Allow-Methods" = true
    "Access-Control-Allow-Origin"  = true
  }
}

# CORS Options Integration Response (if enabled)
resource "aws_api_gateway_integration_response" "property_create_options" {
  count       = var.enable_cors ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.property_create_create.id
  http_method = aws_api_gateway_method.property_create_options[0].http_method
  status_code = aws_api_gateway_method_response.property_create_options[0].status_code

  response_headers = {
    "Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.property_create_options]
}

# API Gateway Integration
resource "aws_api_gateway_integration" "property_create" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.property_create_create.id
  http_method = aws_api_gateway_method.property_create.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = module.property_creation_lambda.invoke_arn  # Property creation Lambda
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = module.property_creation_lambda.function_name  # Property creation Lambda
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# API Gateway Method Response
resource "aws_api_gateway_method_response" "property_create" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.property_create_create.id
  http_method  = aws_api_gateway_method.property_create.http_method
  status_code  = "200"

  response_headers = var.enable_cors ? {
    "Access-Control-Allow-Origin" = true
  } : {}
}

# API Gateway Integration Response
resource "aws_api_gateway_integration_response" "property_create" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.property_create_create.id
  http_method  = aws_api_gateway_method.property_create.http_method
  status_code  = aws_api_gateway_method_response.property_create.status_code

  response_headers = var.enable_cors ? {
    "Access-Control-Allow-Origin" = "'*'"
  } : {}

  depends_on = [aws_api_gateway_integration.property_create]
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "api" {
  depends_on = [
    aws_api_gateway_integration.property_create,
    aws_api_gateway_method_response.property_create,
    aws_api_gateway_integration_response.property_create
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.property_create_create.id,
      aws_api_gateway_method.property_create.id,
      aws_api_gateway_integration.property_create.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway Stage
resource "aws_api_gateway_stage" "api" {
  deployment_id = aws_api_gateway_deployment.api.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = var.environment
}



