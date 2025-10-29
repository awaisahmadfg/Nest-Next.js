import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService {
  private readonly logger = new Logger(SqsService.name);
  private client: SQSClient;
  readonly blockchainQueueUrl: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');

    this.blockchainQueueUrl = this.config.get<string>('SQS_BLOCKCHAIN_QUEUE_URL', '');

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'AWS credentials not configured. SQS operations may fail. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
      );
    }

    this.client = new SQSClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.log(`SQS Service initialized with AWS endpoint (region: ${region})`);
  }

  async send(queueUrl: string, messageBody: unknown): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
    });
    await this.client.send(command);
  }

  async receive(queueUrl: string, maxMessages = 5, waitSeconds = 20) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitSeconds,
      VisibilityTimeout: 60,
    });
    const res = await this.client.send(command);
    return res.Messages ?? [];
  }

  async delete(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
    );
  }
}
