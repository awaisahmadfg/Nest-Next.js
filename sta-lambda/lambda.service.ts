import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { LambdaClient, InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda';
import { ConfigService } from '@nestjs/config';

export interface LambdaPropertyCreationRequest {
  action: 'register' | 'update';
  propertyId: string;
  propertyName: string;
  propertyType?: string;
  fileUrls: string[];
  userId: number;
  userEmail: string;
  userFullName: string;
  tokenId?: number;
}

export interface LambdaPropertyCreationResponse {
  success: boolean;
  data: {
    tokenId: number;
    transactionHash: string;
    metadataCID: string;
    message: string;
  };
}

interface LambdaErrorResponse {
  error: string;
}

@Injectable()
export class LambdaService {
  private readonly logger = new Logger(LambdaService.name);
  private lambdaClient: LambdaClient;
  private functionName: string;

  constructor(private readonly configService: ConfigService) {
    // Initialize Lambda client
    this.lambdaClient = new LambdaClient({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    // Get Lambda function name - same name for all environments
    this.functionName = 'sta-lambda-propertyCreation';

    this.logger.log(`Lambda service initialized for function: ${this.functionName}`);
  }

  /**
   * Invoke the property creation Lambda function
   */
  async invokePropertyCreation(
    request: LambdaPropertyCreationRequest,
  ): Promise<LambdaPropertyCreationResponse> {
    try {
      this.logger.log(
        `Invoking Lambda function ${this.functionName} for property ${request.propertyId}`,
      );

      // Request object into JSON
      const requestPayload = JSON.stringify(request);

      const params: InvokeCommandInput = {
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: requestPayload,
      };

      const command = new InvokeCommand(params);
      const response = await this.lambdaClient.send(command);

      if (!response.Payload) {
        throw new Error('Lambda response payload is empty');
      }

      const payloadString = new TextDecoder().decode(response.Payload);
      const responsePayload: unknown = JSON.parse(payloadString);

      let result: LambdaPropertyCreationResponse | LambdaErrorResponse;

      // Type guard to check if it's API Gateway format
      if (
        typeof responsePayload === 'object' &&
        responsePayload !== null &&
        'body' in responsePayload &&
        typeof (responsePayload as { body: unknown }).body === 'string'
      ) {
        const apiGatewayResponse = responsePayload as { body: string; statusCode?: number };
        result = JSON.parse(apiGatewayResponse.body) as
          | LambdaPropertyCreationResponse
          | LambdaErrorResponse;

        if (apiGatewayResponse.statusCode && apiGatewayResponse.statusCode >= 400) {
          const errorResult = result as LambdaErrorResponse;
          throw new BadRequestException(
            `Lambda execution failed: ${errorResult.error || 'Unknown error'}`,
          );
        }
      } else {
        // Direct response format (shouldn't happen with current handler, but handle it)
        result = responsePayload as LambdaPropertyCreationResponse | LambdaErrorResponse;
      }

      if (response.FunctionError) {
        this.logger.error(
          `Lambda function error: ${response.FunctionError} - ${JSON.stringify(result)}`,
        );
        const errorResult = result as LambdaErrorResponse;
        throw new BadRequestException(
          `Lambda execution failed: ${errorResult.error || 'Unknown error'}`,
        );
      }

      const successResult = result as LambdaPropertyCreationResponse;

      // Validate that data exists
      if (!successResult.data) {
        this.logger.error(`Lambda response missing data field: ${JSON.stringify(successResult)}`);
        throw new BadRequestException('Lambda response is missing required data field');
      }

      this.logger.log(`Lambda function completed successfully for property ${request.propertyId}`);

      return {
        success: successResult.success,
        data: successResult.data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for different error types and provide meaningful messages
      if (
        errorMessage.includes('is not authorized to perform') ||
        errorMessage.includes('not authorized') ||
        errorMessage.includes('AccessDenied') ||
        errorMessage.includes('lambda:InvokeFunction')
      ) {
        // IAM permission error
        this.logger.error(
          `LambdaService: IAM Permission Error! Your AWS user needs Lambda invoke permissions.`,
        );
        this.logger.error(
          `Required action: lambda:InvokeFunction for function: ${this.functionName}`,
        );
        this.logger.error(
          `Please attach an IAM policy with lambda:InvokeFunction permission. See AWS Console > IAM > Users > usama > Add permissions`,
        );
        throw new BadRequestException(
          `Lambda invoke permission denied. Please add lambda:InvokeFunction permission to your AWS user. Function: ${this.functionName}`,
        );
      } else if (
        errorMessage.includes('ResourceNotFoundException') ||
        errorMessage.includes('Function not found') ||
        errorMessage.includes('does not exist')
      ) {
        // Lambda function doesn't exist
        this.logger.error(`LambdaService: Lambda function does not exist: ${this.functionName}`);
        this.logger.error(
          `Please deploy the Lambda function first: cd sta-lambda && serverless deploy`,
        );
        throw new BadRequestException(
          `Lambda function '${this.functionName}' does not exist. Please deploy it first.`,
        );
      } else if (
        errorMessage.includes('InvalidAccessKeyId') ||
        errorMessage.includes('SignatureDoesNotMatch') ||
        errorMessage.includes('InvalidClientTokenId')
      ) {
        // AWS authentication error
        this.logger.error(
          `LambdaService: AWS authentication error. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.`,
        );
        throw new BadRequestException(
          'AWS authentication failed. Check your AWS credentials configuration.',
        );
      } else if (
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('connect') ||
        errorMessage.includes('timeout')
      ) {
        // Network/connection error
        this.logger.error(
          `LambdaService: Cannot connect to AWS Lambda. Check your network connection and AWS region: ${this.configService.get<string>('AWS_REGION', 'us-east-1')}`,
        );
        throw new BadRequestException(
          'Failed to connect to AWS Lambda service. Check your network connection.',
        );
      } else if (errorMessage.includes('ECONNRESET') || errorMessage.includes('read ECONNRESET')) {
        // Network reset
        this.logger.warn(`LambdaService: Network connection reset while invoking Lambda`);
        throw new BadRequestException('Network connection reset. Please retry the operation.');
      } else if (errorMessage.includes('Throttling') || errorMessage.includes('Rate exceeded')) {
        // Rate limiting
        this.logger.warn(
          `LambdaService: Lambda invocation rate limit exceeded. Please wait and retry.`,
        );
        throw new BadRequestException(
          'Lambda invocation rate limit exceeded. Please wait and retry.',
        );
      } else if (error instanceof BadRequestException) {
        // Already a BadRequestException, re-throw as is
        throw error;
      } else {
        // Generic error
        this.logger.error(`LambdaService: Failed to invoke Lambda function: ${errorMessage}`);
        throw new BadRequestException(`Failed to invoke Lambda function: ${errorMessage}`);
      }
    }
  }
}
