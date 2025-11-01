import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { PinataService } from '../../pinata/pinata.service';
import {
  EmailType,
  BlockchainTransactionCompletedEmailContext,
} from '../../email/types/email.types';
import type {
  BlockchainRegistrationJobData,
  BlockchainRegistrationJobResult,
} from '../types/blockchain-job.types';

@Processor('blockchain-registration')
export class BlockchainProcessor extends WorkerHost {
  private readonly logger = new Logger(BlockchainProcessor.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly pinataService: PinataService,
  ) {
    super();
  }

  async process(job: Job<BlockchainRegistrationJobData>): Promise<BlockchainRegistrationJobResult> {
    const { propertyId, propertyName, fileUrls, userEmail, userFullName } = job.data;

    this.logger.log(
      `Processing blockchain registration job for property ${propertyId} (Job ID: ${job.id})`,
    );

    try {
      // 1) Upload files to Pinata → get metadata CID
      if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
        throw new Error('No files provided for Pinata upload');
      }
      this.logger.log(
        `Uploading files to Pinata for property ${propertyId} to generate metadata CID`,
      );
      const uploadResult = await this.pinataService.uploadS3Files({
        propertyId,
        fileUrls: fileUrls,
      });

      const metadataCID: string | undefined = uploadResult.metadataCID;
      if (!metadataCID) {
        throw new Error('Pinata upload did not return a metadata CID');
      }

      // 2) Wallet balance and gas estimation check before registering
      await this.blockchainService.ensureSufficientBalanceForRegisterLand(metadataCID);

      this.logger.log(`Registering property ${propertyId} on blockchain with CID: ${metadataCID}`);
      const result: { hash: string; tokenId: number } =
        await this.blockchainService.registerLand(metadataCID);

      this.logger.log(
        `Blockchain registration completed for property ${propertyId}. Token ID: ${result.tokenId}, Transaction: ${result.hash}`,
      );

      await this.prisma.property.update({
        where: { propertyId },
        data: {
          tokenId: result.tokenId,
          transactionHash: result.hash,
        },
      });

      this.logger.log(`Property ${propertyId} updated with blockchain info successfully`);

      try {
        const appUrlBase = process.env.WEBSITE_URL;
        const propertyRecord = await this.prisma.property.findUnique({
          where: { propertyId },
          select: { id: true },
        });
        const actionUrl = `${appUrlBase}/properties/${propertyRecord?.id ?? propertyId}/add-info`;
        const chainName = process.env.CHAIN_NAME;
        const emailContext: BlockchainTransactionCompletedEmailContext = {
          recipientEmail: userEmail,
          recipientName: userFullName,
          propertyName,
          propertyId,
          transactionHash: result.hash,
          tokenId: result.tokenId,
          explorerUrl: `${process.env.ETHERSCAN_BASE_URL}${result.hash}`,
          actionUrl,
          chainName,
        };

        // 3) Send Blockchain related info on logined user email
        await this.emailService.sendEmail(EmailType.BLOCKCHAIN_TRANSACTION_COMPLETED, emailContext);
        this.logger.log(
          `Blockchain transaction completion email sent to ${userEmail} for property ${propertyId}`,
        );
      } catch (emailError: unknown) {
        const emailErrorMessage =
          emailError instanceof Error ? emailError.message : 'Unknown error';
        this.logger.error(
          `Failed to send blockchain transaction completion email for property ${propertyId}: ${emailErrorMessage}`,
        );
      }

      return {
        success: true,
        tokenId: result.tokenId,
        transactionHash: result.hash,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Blockchain registration failed for property ${propertyId}: ${errorMessage}`,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<BlockchainRegistrationJobData>, result: BlockchainRegistrationJobResult) {
    if (result.success) {
      this.logger.log(
        `Blockchain registration job completed successfully for property ${job.data.propertyId} (Job ID: ${job.id})`,
      );
    } else {
      this.logger.error(
        `Blockchain registration job failed for property ${job.data.propertyId} (Job ID: ${job.id}): ${result.error}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BlockchainRegistrationJobData> | undefined, error: Error) {
    if (job) {
      this.logger.error(
        `Blockchain registration job failed for property ${job.data.propertyId} (Job ID: ${job.id}): ${error.message}`,
      );
    } else {
      this.logger.error(`Blockchain registration job failed: ${error.message}`);
    }
  }

  // meaning the worker lost the job or it timed out
  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Blockchain registration job stalled: ${jobId}`);
  }
}
