import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { RegisterLandDto } from './dto/register-land.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import {
  RegisterLandResponse,
  UpdatePropertyResponse,
  PropertyResponse,
  CIDCheckResponse,
} from './dto/blockchain-response.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('api/blockchain')
@UseGuards(JwtAuthGuard)
export class BlockchainController {
  private readonly logger = new Logger(BlockchainController.name);

  constructor(private readonly blockchainService: BlockchainService) {}

  /**
   * Register a new property on the blockchain
   * @param registerLandDto - Property registration data
   * @returns Blockchain transaction response with token ID
   */
  @Post('register-land')
  @HttpCode(HttpStatus.CREATED)
  async registerLand(
    @Body(ValidationPipe) registerLandDto: RegisterLandDto,
  ): Promise<RegisterLandResponse> {
    this.logger.log(`Registering land for wallet: ${registerLandDto.landOwnerWallet}`);

    const result = await this.blockchainService.registerLand(
      registerLandDto.cid,
      registerLandDto.landOwnerWallet,
    );

    return {
      ...result,
      tokenId: result.tokenId,
    };
  }

  /**
   * Update property metadata on the blockchain
   * @param updatePropertyDto - Property update data
   * @returns Blockchain transaction response
   */
  @Post('update-property')
  @HttpCode(HttpStatus.OK)
  async updateProperty(
    @Body(ValidationPipe) updatePropertyDto: UpdatePropertyDto,
  ): Promise<UpdatePropertyResponse> {
    this.logger.log(`Updating property: ${updatePropertyDto.tokenId}`);

    const result = await this.blockchainService.updateProperty(
      updatePropertyDto.tokenId,
      updatePropertyDto.newCid,
    );

    return {
      ...result,
      tokenId: updatePropertyDto.tokenId,
      newCid: updatePropertyDto.newCid,
    };
  }

  /**
   * Get property information from the blockchain
   * @param tokenId - Property token ID
   * @returns Property information
   */
  @Get('property/:tokenId')
  async getProperty(@Param('tokenId', ParseIntPipe) tokenId: number): Promise<PropertyResponse> {
    this.logger.log(`Getting property information for token ID: ${tokenId}`);

    const property = await this.blockchainService.getProperty(tokenId);

    return {
      success: true,
      data: property,
    };
  }

  /**
   * Check if a CID is already used
   * @param cid - IPFS Content Identifier
   * @returns Boolean indicating if CID is used
   */
  @Get('cid-used/:cid')
  async isCIDUsed(@Param('cid') cid: string): Promise<CIDCheckResponse> {
    this.logger.log(`Checking if CID is used: ${cid}`);

    const isUsed = await this.blockchainService.isCIDUsed(cid);

    return {
      success: true,
      isUsed,
      cid,
    };
  }
}
