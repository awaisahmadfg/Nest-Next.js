import { Controller, Post, Body, UseGuards, Logger, Get, Query } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { RegisterLandDto } from './dto/register-land.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { BlockchainResponseDto } from './dto/blockchain-response.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { GetPropertyDto } from './dto/get-proeperty.dto';
import { OwnershipHistoryResponse } from './dto/ownership-history.dto';

@Controller('api/blockchain')
@UseGuards(JwtAuthGuard)
export class BlockchainController {
  private readonly logger = new Logger(BlockchainController.name);

  constructor(private readonly blockchainService: BlockchainService) {}

  /**
   * Register a new property on the blockchain
   * @param registerLandDto Property registration data
   * @returns Blockchain transaction result
   */
  @Post('register-land')
  async registerLand(@Body() registerLandDto: RegisterLandDto): Promise<BlockchainResponseDto> {
    try {
      this.logger.log(`Registering land with CID: ${registerLandDto.cid}`);

      const result = await this.blockchainService.registerLand(registerLandDto.cid);

      return {
        success: true,
        message: 'Property registered successfully on blockchain',
        transactionHash: result.hash,
        tokenId: result.tokenId,
        cid: registerLandDto.cid,
      };
    } catch (error) {
      this.logger.error('Failed to register land:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to register property on blockchain';

      return {
        success: false,
        message: errorMessage,
        cid: registerLandDto.cid,
      };
    }
  }

  /**
   * Update property metadata on the blockchain
   * @param updatePropertyDto Property update data
   * @returns Blockchain transaction result
   */
  @Post('update-property')
  async updateProperty(
    @Body() updatePropertyDto: UpdatePropertyDto,
  ): Promise<BlockchainResponseDto> {
    try {
      this.logger.log(
        `Updating property ${updatePropertyDto.tokenId} with new CID: ${updatePropertyDto.newCid}`,
      );

      const result = await this.blockchainService.updateProperty(
        updatePropertyDto.tokenId,
        updatePropertyDto.newCid,
      );

      return {
        success: true,
        message: 'Property updated successfully on blockchain',
        transactionHash: result.hash,
        tokenId: updatePropertyDto.tokenId,
        cid: updatePropertyDto.newCid,
      };
    } catch (error) {
      this.logger.error(`Failed to update property ${updatePropertyDto.tokenId}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update property on blockchain';

      return {
        success: false,
        message: errorMessage,
        tokenId: updatePropertyDto.tokenId,
        cid: updatePropertyDto.newCid,
      };
    }
  }

  /**
   * Get property information from the blockchain
   * @param getPropertyDto Property query data
   * @returns Property information
   */
  @Get('get-property')
  async getProperty(@Body() getPropertyDto: GetPropertyDto): Promise<BlockchainResponseDto> {
    try {
      this.logger.log(`Getting property information for token ID: ${getPropertyDto.tokenId}`);

      const property = await this.blockchainService.getProperty(getPropertyDto.tokenId);

      return {
        success: true,
        message: 'Property information retrieved successfully',
        tokenId: property.tokenId,
        cid: property.cid,
        landOwner: property.landOwner,
      };
    } catch (error) {
      this.logger.error(`Failed to get property ${getPropertyDto.tokenId}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get property information';

      return {
        success: false,
        message: errorMessage,
        tokenId: getPropertyDto.tokenId,
      };
    }
  }

  /**
   * Get property ownership history using Moralis API
   * @param propertyId Property ID to get ownership history for
   * @returns Property ownership history
   */
  @Get('ownership-history')
  async getPropertyOwnershipHistory(
    @Query('propertyId') propertyId: string,
  ): Promise<OwnershipHistoryResponse> {
    try {
      this.logger.log(`Getting ownership history for property: ${propertyId}`);

      if (!propertyId) {
        return {
          success: false,
          message: 'Property ID is required',
        };
      }

      const ownershipHistory = await this.blockchainService.getPropertyOwnershipHistory(propertyId);

      return {
        success: true,
        message: 'Property ownership history retrieved successfully',
        data: ownershipHistory,
      };
    } catch (error) {
      this.logger.error(`Failed to get ownership history for property ${propertyId}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get property ownership history';

      return {
        success: false,
        message: errorMessage,
      };
    }
  }
}
