import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LambdaService } from './lambda.service';

@Module({
  imports: [ConfigModule],
  providers: [LambdaService],
  exports: [LambdaService],
})
export class LambdaModule {}
