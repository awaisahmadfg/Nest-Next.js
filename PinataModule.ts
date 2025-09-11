import { Module } from '@nestjs/common';
import { PinataService } from './pinata.service';
import { PinataController } from './pinata.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PinataController],
  providers: [PinataService, PrismaService],
  exports: [PinataService],
})
export class PinataModule {}
