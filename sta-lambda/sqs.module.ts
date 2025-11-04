import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SqsService } from './sqs.service';
import { BlockchainConsumer } from './consumers/blockchain.consumer';
import { PrismaModule } from '../prisma/prisma.module';
import { LambdaModule } from '../lambda/lambda.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ConfigModule, PrismaModule, LambdaModule, EmailModule],
  providers: [SqsService, BlockchainConsumer],
  exports: [SqsService],
})
export class SqsModule {}

