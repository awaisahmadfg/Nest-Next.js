import { Injectable, OnModuleInit, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

interface ExpressApp {
  use: (path: string, handler: unknown) => void;
}

function isExpressApp(app: unknown): app is ExpressApp {
  return (
    (typeof app === 'object' || typeof app === 'function') &&
    app !== null &&
    'use' in app &&
    typeof (app as ExpressApp).use === 'function'
  );
}

@Injectable()
export class BullBoardService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(BullBoardService.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @InjectQueue('blockchain-registration')
    private readonly blockchainQueue: Queue,
  ) {}

  onModuleInit(): void {
    // Attach Bull Board to the existing Nest (Express) server
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      this.logger.error('HttpAdapter not available');
      return;
    }

    const appInstance: unknown = httpAdapter.getInstance();

    if (!isExpressApp(appInstance)) {
      this.logger.error('Failed to get Express app instance from httpAdapter');
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');

    createBullBoard({
      queues: [new BullMQAdapter(this.blockchainQueue)],
      serverAdapter,
    });

    appInstance.use('/queues', serverAdapter.getRouter());
    this.logger.log('Bull Board dashboard mounted at /queues');
  }

  onApplicationBootstrap(): void {
    // Try again after application bootstrap if onModuleInit failed
    this.logger.log('Application bootstrap completed, attempting to mount Bull Board again');
    this.onModuleInit();
  }
}
