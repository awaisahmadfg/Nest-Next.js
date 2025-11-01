import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/guard/public.decoratore';
import { QueueService } from './queue.service';
import type { BlockchainRegistrationJobData } from './types/blockchain-job.types';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Public()
  @Post('blockchain/register')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueBlockchainRegistration(@Body() body: BlockchainRegistrationJobData) {
    const job = await this.queueService.enqueueBlockchainRegistration(body);
    return { jobId: job.id };
  }
}
