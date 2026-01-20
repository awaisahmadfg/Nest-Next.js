import { Module } from '@nestjs/common';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { UsersModule } from '../users/users.module';
import { S3Service } from '../file-upload/s3.service';
import { PinataModule } from '../pinata/pinata.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { EmailModule } from '../email/email.module';
import { LambdaModule } from '../lambda/lambda.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PuppeteerShutdownService } from './puppeteer.shutdown';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    PrismaModule,
    InvitationsModule,
    UsersModule,
    PinataModule,
    BlockchainModule,
    EmailModule,
    LambdaModule,
    AuthModule,
    ConfigModule,
    NotificationsModule,
  ],
  controllers: [PropertyController],
  providers: [PropertyService, S3Service, PuppeteerShutdownService, AnalyticsService],
})
export class PropertyModule {}
