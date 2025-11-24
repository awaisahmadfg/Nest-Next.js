import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { BlockchainService } from "../../shared/services/blockchain.service";
import { PinataService } from "../../shared/services/pinata.service";
import {
  PropertyCreationEvent,
  PropertyCreationResult,
} from "../../shared/types/lambda.types";

export const propertyCreationHandler = async (
  event: APIGatewayProxyEvent | PropertyCreationEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const logger = {
    info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ""),
    error: (msg: string, data?: any) =>
      console.error(`[ERROR] ${msg}`, data || ""),
    warn: (msg: string, data?: any) =>
      console.warn(`[WARN] ${msg}`, data || ""),
  };

  try {
    logger.info(`Handler started - RequestId: ${context.awsRequestId}`);

    // Determine if this is an API Gateway invocation or direct Lambda invocation
    // API Gateway events have httpMethod property, direct invocations don't
    const eventAny = event as any;
    const isApiGatewayInvocation =
      typeof eventAny === "object" &&
      eventAny !== null &&
      "httpMethod" in eventAny &&
      typeof eventAny.httpMethod === "string";

    let propertyData: PropertyCreationEvent;

    if (isApiGatewayInvocation) {
      // Handle API Gateway invocation
      const apiEvent = event as APIGatewayProxyEvent;

      // Handle CORS preflight (OPTIONS) requests
      if (apiEvent.httpMethod === "OPTIONS") {
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
          },
          body: "",
        };
      }

      // Validate HTTP method
      if (apiEvent.httpMethod !== "POST") {
        return {
          statusCode: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            success: false,
            error: `Method ${apiEvent.httpMethod} not allowed. Only POST is supported.`,
          }),
        };
      }

      // Parse and validate request body
      if (!apiEvent.body || apiEvent.body.trim() === "") {
        throw new Error("Request body is required");
      }

      try {
        propertyData = JSON.parse(apiEvent.body);
      } catch {
        throw new Error("Invalid JSON in request body");
      }
    } else {
      // Handle direct Lambda invocation - event is the request object directly
      propertyData = event as PropertyCreationEvent;
    }

    // Validate required fields
    if (
      !propertyData.action ||
      !propertyData.propertyId ||
      !propertyData.userEmail ||
      !propertyData.fileUrls
    ) {
      throw new Error(
        "Missing required fields: action, propertyId, userEmail, and fileUrls"
      );
    }

    // Validate action
    if (propertyData.action !== 'register' && propertyData.action !== 'update') {
      throw new Error("action must be either 'register' or 'update'");
    }

    // Validate tokenId for update action
    if (propertyData.action === 'update' && !propertyData.tokenId) {
      throw new Error("tokenId is required for 'update' action");
    }

    // Validate fileUrls
    if (
      !Array.isArray(propertyData.fileUrls) ||
      propertyData.fileUrls.length === 0
    ) {
      throw new Error("fileUrls must be a non-empty array");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(propertyData.userEmail)) {
      throw new Error("Invalid email format");
    }

    logger.info(
      `Processing property ${propertyData.action} for property ${propertyData.propertyId}`
    );
    logger.info(
      `Property data received: propertyType=${propertyData.propertyType || 'NOT PROVIDED'}, propertyName=${propertyData.propertyName}`
    );

    let metadataCID: string;
    let blockchainResult: { hash: string; tokenId?: number };

    // Initialize services
    const blockchainService = new BlockchainService();
    const pinataService = new PinataService();

    // ============================================
    // STEP 1: Upload files to Pinata (REQUIRED)
    // ============================================
    {
      logger.info(`Uploading ${propertyData.fileUrls.length} files to Pinata`);

      logger.info(
        `Calling Pinata uploadS3Files with propertyType: ${propertyData.propertyType || 'NOT PROVIDED'}`
      );

      const uploadResult = await pinataService.uploadS3Files({
        propertyId: propertyData.propertyId,
        fileUrls: propertyData.fileUrls,
        propertyOwnerName: propertyData.userFullName,
        propertyName: propertyData.propertyName,
        propertyType: propertyData.propertyType,
      });

      metadataCID = uploadResult.metadataCID;
      if (!metadataCID) {
        throw new Error("Pinata upload did not return a metadata CID");
      }

      logger.info(`Pinata upload completed. Metadata CID: ${metadataCID}`);

      // ============================================
      // STEP 2: Check wallet balance before blockchain transaction
      // ============================================
      if (propertyData.action === 'register') {
        await blockchainService.ensureSufficientBalanceForRegisterLand(
          metadataCID
        );
      } else {
        await blockchainService.ensureSufficientBalanceForUpdateProperty(
          propertyData.tokenId!,
          metadataCID
        );
      }

      logger.info(`Balance check passed`);

      // ============================================
      // STEP 3: Register or Update on blockchain
      // ============================================
      if (propertyData.action === 'register') {
        logger.info(
          `Registering property on blockchain with CID: ${metadataCID}`
        );

        const registerResult = await blockchainService.registerLand(metadataCID);
        blockchainResult = {
          hash: registerResult.hash,
          tokenId: registerResult.tokenId,
        };

        logger.info(
          `Blockchain registration completed. Token ID: ${blockchainResult.tokenId}, Hash: ${blockchainResult.hash}`
        );
      } else {
        logger.info(
          `Updating property ${propertyData.tokenId} on blockchain with CID: ${metadataCID}`
        );

        const updateResult = await blockchainService.updateProperty(
          propertyData.tokenId!,
          metadataCID
        );
        blockchainResult = {
          hash: updateResult.hash,
          tokenId: propertyData.tokenId,
        };

        logger.info(
          `Blockchain update completed. Token ID: ${blockchainResult.tokenId}, Hash: ${blockchainResult.hash}`
        );
      }
    }

    const result: PropertyCreationResult = {
      success: true,
      tokenId: blockchainResult.tokenId,
      transactionHash: blockchainResult.hash,
      metadataCID,
      message: propertyData.action === 'register'
        ? "Property created and registered on blockchain successfully"
        : "Property updated on blockchain successfully",
    };

    const duration = Date.now() - startTime;
    logger.info(`Handler completed successfully in ${duration}ms`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: true,
        data: result,
        message: result.message,
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Handler failed after ${duration}ms`, error);

    let statusCode = 500;
    let errorMessage = "Internal server error";

    if (error instanceof Error) {
      errorMessage = error.message;

      // Set appropriate status codes
      if (
        errorMessage.includes("Missing required") ||
        errorMessage.includes("Invalid")
      ) {
        statusCode = 400;
      } else if (errorMessage.includes("Insufficient balance")) {
        statusCode = 402;
      } else if (
        errorMessage.includes("Service") ||
        errorMessage.includes("AWS")
      ) {
        statusCode = 503;
      }
    }

    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: false,
        error: errorMessage,
      }),
    };
  }
};
