import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SqsService } from '../sqs.service';
import { LambdaService } from '../../lambda/lambda.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { EmailType } from '../../email/types/email.types';

@Injectable()
export class BlockchainConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainConsumer.name);
  private running = true;

  constructor(
    private readonly sqs: SqsService,
    private readonly lambda: LambdaService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    void this.loop();
  }

  onModuleDestroy() {
    this.running = false;
  }

  private async loop() {
    while (this.running) {
      try {
        const messages = await this.sqs.receive(this.sqs.blockchainQueueUrl);
        if (messages.length === 0) continue;

        for (const msg of messages) {
          try {
            const payload = JSON.parse(msg.Body || '{}') as {
              propertyId: string;
              propertyName: string;
              fileUrls: string[];
              userId: number;
              userEmail: string;
              userFullName: string;
            };
            const { propertyId, propertyName, fileUrls, userId, userEmail, userFullName } = payload;

            const result = await this.lambda.invokePropertyCreation({
              propertyId,
              propertyName,
              fileUrls,
              userId,
              userEmail,
              userFullName,
            });

            await this.prisma.property.update({
              where: { propertyId: propertyId },
              data: {
                tokenId: result.data.tokenId,
                transactionHash: result.data.transactionHash,
                documentsCID: result.data.metadataCID,
              },
            });

            // Send email notification after successful blockchain registration
            try {
              await this.emailService.sendEmail(EmailType.BLOCKCHAIN_TRANSACTION_COMPLETED, {
                recipientEmail: userEmail,
                recipientName: userFullName,
                propertyName,
                propertyId: propertyId,
                transactionHash: result.data.transactionHash,
                tokenId: result.data.tokenId,
                explorerUrl: `https://etherscan.io/tx/${result.data.transactionHash}`,
                actionUrl: `${process.env.WEBSITE_URL}/properties/${propertyId}/add-info`,
                chainName: process.env.CHAIN_NAME,
              });

              this.logger.log(`Blockchain transaction completion email sent to ${userEmail}`);
            } catch (emailError: unknown) {
              const emailErrorMessage =
                emailError instanceof Error ? emailError.message : 'Unknown error';
              this.logger.error(
                `Failed to send blockchain transaction completion email for property ${propertyId}: ${emailErrorMessage}`,
              );
              // Don't fail the job if email fails
            }

            if (msg.ReceiptHandle)
              // Delete job from queue
              await this.sqs.delete(this.sqs.blockchainQueueUrl, msg.ReceiptHandle);
          } catch (err) {
            this.logger.error(
              `BlockchainConsumer job failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        // Check for different error types
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
          // Connection error
          this.logger.warn(
            `BlockchainConsumer: Cannot connect to SQS queue. Check your network connection and AWS credentials. Waiting 5 seconds before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else if (
          errorMessage.includes('is not authorized to perform') ||
          errorMessage.includes('not authorized')
        ) {
          // IAM permission error - log once and provide clear guidance
          this.logger.error(
            `BlockchainConsumer: IAM Permission Error! Your AWS user needs SQS permissions. Required actions: sqs:ReceiveMessage, sqs:SendMessage, sqs:DeleteMessage, sqs:GetQueueAttributes`,
          );
          this.logger.error(
            `Please attach an IAM policy to user 'usama' with these permissions for queue 'BlockChain'. See AWS Console > IAM > Users > usama > Add permissions`,
          );
          await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait longer to avoid spam
        } else if (
          errorMessage.includes('InvalidAccessKeyId') ||
          errorMessage.includes('SignatureDoesNotMatch') ||
          errorMessage.includes('AccessDenied')
        ) {
          // AWS authentication/authorization error
          this.logger.error(
            `BlockchainConsumer: AWS authentication error. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. Error: ${errorMessage}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait longer for auth errors
        } else if (
          errorMessage.includes('NonExistentQueue') ||
          errorMessage.includes('AWS.SimpleQueueService.NonExistentQueue')
        ) {
          // Queue doesn't exist
          this.logger.error(
            `BlockchainConsumer: SQS queue does not exist. Check SQS_BLOCKCHAIN_QUEUE_URL: ${this.sqs.blockchainQueueUrl}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));
        } else if (
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('read ECONNRESET')
        ) {
          // Network reset - might be transient
          this.logger.warn(
            `BlockchainConsumer: Network connection reset. Retrying in 3 seconds...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          // Other errors
          this.logger.error(`BlockchainConsumer loop error: ${errorMessage}`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }
}
