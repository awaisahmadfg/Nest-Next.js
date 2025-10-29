// Import idempotent babel-polyfill first to allow multiple imports without errors
import "idempotent-babel-polyfill";
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
  event: APIGatewayProxyEvent,
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

    // Parse and validate request body
    if (!event.body) {
      throw new Error("Request body is required");
    }

    let propertyData: PropertyCreationEvent;
    try {
      propertyData = JSON.parse(event.body);
    } catch {
      throw new Error("Invalid JSON in request body");
    }

    // Validate required fields
    if (
      !propertyData.propertyId ||
      !propertyData.userEmail ||
      !propertyData.fileUrls
    ) {
      throw new Error(
        "Missing required fields: propertyId, userEmail, and fileUrls"
      );
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
      `Processing property creation for property ${propertyData.propertyId}`
    );

    let metadataCID: string;
    let blockchainResult: { hash: string; tokenId: number };

    // Initialize services
    const blockchainService = new BlockchainService();
    const pinataService = new PinataService();

    // ============================================
    // STEP 1: Upload files to Pinata (REQUIRED)
    // ============================================
    {
      logger.info(`Uploading ${propertyData.fileUrls.length} files to Pinata`);

      const uploadResult = await pinataService.uploadS3Files({
        propertyId: propertyData.propertyId,
        fileUrls: propertyData.fileUrls,
        propertyOwnerName: propertyData.userFullName,
        propertyName: propertyData.propertyName,
      });

      metadataCID = uploadResult.metadataCID;
      if (!metadataCID) {
        throw new Error("Pinata upload did not return a metadata CID");
      }

      logger.info(`Pinata upload completed. Metadata CID: ${metadataCID}`);

      // ============================================
      // STEP 2: Check wallet balance before blockchain transaction
      // ============================================
      await blockchainService.ensureSufficientBalanceForRegisterLand(
        metadataCID
      );

      logger.info(`Balance check passed`);

      // ============================================
      // STEP 3: Register on blockchain
      // ============================================
      logger.info(
        `Registering property on blockchain with CID: ${metadataCID}`
      );

      blockchainResult = await blockchainService.registerLand(metadataCID);

      logger.info(
        `Blockchain registration completed. Token ID: ${blockchainResult.tokenId}, Hash: ${blockchainResult.hash}`
      );
    }

    const result: PropertyCreationResult = {
      success: true,
      tokenId: blockchainResult.tokenId,
      transactionHash: blockchainResult.hash,
      metadataCID,
      message: "Property created and registered on blockchain successfully",
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
