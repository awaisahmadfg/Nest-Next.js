import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { BaseHandler } from "../../shared/handlers/base.handler";
import { BlockchainService } from "../../shared/services/blockchain.service";
import { PinataService } from "../../shared/services/pinata.service";
import { EmailService, EmailType } from "../../shared/services/email.service";
import {
  PropertyCreationEvent,
  PropertyCreationResult,
} from "../../types/lambda.types";
import { ValidationUtil } from "../../shared/utils/validation.util";
import { Logger } from "../../shared/utils/logger.util";

class PropertyCreationHandler extends BaseHandler {
  private blockchainService: BlockchainService;
  private pinataService: PinataService;
  private emailService: EmailService;

  constructor() {
    super();
    this.blockchainService = new BlockchainService();
    this.pinataService = new PinataService();
    this.emailService = new EmailService();
  }

  protected validateInput(data: PropertyCreationEvent): void {
    ValidationUtil.validateRequiredFields(data, ["propertyId", "userEmail"]);
    ValidationUtil.validatePropertyId(data.propertyId);
    ValidationUtil.validateEmail(data.userEmail);

    if (data.fileUrls && data.fileUrls.length > 0) {
      ValidationUtil.validateFileUrls(data.fileUrls);
    }
  }

  protected async processRequest(
    propertyData: PropertyCreationEvent
  ): Promise<PropertyCreationResult> {
    Logger.info(
      `Processing property creation for property ${propertyData.propertyId}`
    );

    let metadataCID: string | undefined;
    let blockchainResult: { hash: string; tokenId: number } | undefined;
    const warnings: string[] = [];

    // Step 1: Upload files to Pinata (if files are provided)
    if (propertyData.fileUrls && propertyData.fileUrls.length > 0) {
      Logger.info(
        `Uploading files to Pinata for property ${propertyData.propertyId}`
      );

      const uploadResult = await this.pinataService.uploadS3Files({
        propertyId: propertyData.propertyId,
        fileUrls: propertyData.fileUrls,
        propertyOwnerName: propertyData.userFullName,
        propertyName: propertyData.propertyName,
      });

      metadataCID = uploadResult.metadataCID;
      if (!metadataCID) {
        throw new Error("Pinata upload did not return a metadata CID");
      }

      Logger.success(`Pinata upload completed. Metadata CID: ${metadataCID}`);

      // Step 2: Wallet balance and gas estimation check before registering
      await this.blockchainService.ensureSufficientBalanceForRegisterLand(
        metadataCID
      );

      // Step 3: Register property on blockchain
      Logger.info(
        `Registering property ${propertyData.propertyId} on blockchain with CID: ${metadataCID}`
      );
      blockchainResult = await this.blockchainService.registerLand(metadataCID);

      Logger.success(
        `Blockchain registration completed for property ${propertyData.propertyId}. Token ID: ${blockchainResult.tokenId}, Transaction: ${blockchainResult.hash}`
      );
    } else {
      Logger.info(
        `No files provided for property ${propertyData.propertyId}, skipping Pinata and blockchain registration`
      );
    }

    // Step 4: Send completion email (if blockchain registration was successful)
    if (blockchainResult) {
      try {
        await this.emailService.sendEmail(
          EmailType.BLOCKCHAIN_TRANSACTION_COMPLETED,
          {
            recipientEmail: propertyData.userEmail,
            recipientName: propertyData.userFullName,
            propertyName: propertyData.propertyName,
            transactionHash: blockchainResult.hash,
            tokenId: blockchainResult.tokenId,
            userFullName: propertyData.userFullName,
          }
        );

        Logger.success(`Email sent successfully to ${propertyData.userEmail}`);
      } catch (emailError) {
        const errorMessage =
          emailError instanceof Error
            ? emailError.message
            : "Unknown email error";
        warnings.push(`Email notification failed: ${errorMessage}`);
        Logger.warn("Failed to send email", emailError);
      }
    }

    // Return success response
    const result: PropertyCreationResult = {
      success: true,
      tokenId: blockchainResult?.tokenId,
      transactionHash: blockchainResult?.hash,
      metadataCID: metadataCID,
      message: blockchainResult
        ? "Property created and registered on blockchain successfully"
        : "Property created successfully (no files uploaded)",
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }
}

// Create handler instance
const handler = new PropertyCreationHandler();

// Export the handler function
export const propertyCreationHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  return handler.handle(event, context);
};
