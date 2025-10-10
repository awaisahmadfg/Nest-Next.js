import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MoralisApiResponse, MoralisTransfer } from './types/blockchain.types';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private contractAddress: string;

  constructor(private readonly prisma: PrismaService) {
    this.initializeBlockchain();
  }

  private initializeBlockchain() {
    try {
      // Get configuration from environment variables
      const rpcUrl = process.env.INFURA_RPC_URL;
      const privateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
      const contractAddress = process.env.SMART_TAGS_CONTRACT_ADDRESS;

      if (!privateKey) {
        throw new Error('MASTER_WALLET_PRIVATE_KEY environment variable is required');
      }

      if (!contractAddress) {
        throw new Error('SMART_TAGS_CONTRACT_ADDRESS environment variable is required');
      }

      // Load ABI from JSON file (support dist and src paths)
      const candidateAbiPaths = [
        join(process.cwd(), 'dist/src/contracts/abis/SmartTags.json'),
        join(process.cwd(), 'src/contracts/abis/SmartTags.json'),
      ];

      let abiData: string | null = null;
      for (const path of candidateAbiPaths) {
        try {
          abiData = readFileSync(path, 'utf8');
          this.logger.log(`Loaded SmartTags ABI from: ${path}`);
          break;
        } catch {
          // try next
        }
      }

      if (!abiData) {
        throw new Error('SmartTags ABI file not found in dist or src paths');
      }
      const SmartTagsABI = JSON.parse(abiData) as ethers.InterfaceAbi;

      // Initialize provider and wallet
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      // Initialize contract
      this.contract = new ethers.Contract(contractAddress, SmartTagsABI, this.wallet);
      this.contractAddress = contractAddress;

      this.logger.log('Blockchain service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service:', error);
      throw new InternalServerErrorException('Blockchain service initialization failed');
    }
  }

  /**
   * Register a new property on the blockchain
   * @param cid IPFS Content Identifier
   * @returns Transaction result with token ID
   */
  async registerLand(cid: string): Promise<{ hash: string; tokenId: number }> {
    try {
      this.logger.log(`Registering land with CID: ${cid}`);

      // Check if CID is already used
      const isCIDUsed = (await this.contract.isCIDUsed(cid)) as boolean;
      if (isCIDUsed) {
        throw new BadRequestException('CID is already used');
      }

      // Execute the transaction
      const tx = (await this.contract.registerLand(cid)) as ethers.TransactionResponse;
      this.logger.log(`Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      const receipt = (await tx.wait()) as ethers.TransactionReceipt;

      if (receipt.status !== 1) {
        throw new InternalServerErrorException('Transaction failed');
      }

      // Get minted token ID from event logs
      const event = receipt.logs.find((log) => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed?.name === 'PropertyRegistered';
        } catch {
          return false;
        }
      });

      let tokenId: number;
      if (event) {
        const parsed = this.contract.interface.parseLog(event);
        if (parsed?.args && 'tokenId' in parsed.args) {
          tokenId = Number(parsed.args.tokenId);
        } else {
          // Fallback if tokenId not found in args
          const nextTokenId = (await this.contract.getNextTokenId()) as bigint;
          tokenId = Number(nextTokenId) - 1;
        }
      } else {
        // Fallback: get the next token ID (current - 1)
        const nextTokenId = (await this.contract.getNextTokenId()) as bigint;
        tokenId = Number(nextTokenId) - 1;
      }

      this.logger.log(`Property registered successfully with token ID: ${tokenId}`);

      return {
        hash: tx.hash,
        tokenId,
      };
    } catch (error) {
      this.logger.error('Failed to register land:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle smart contract errors
      if ((error as { code?: string }).code === 'CALL_EXCEPTION') {
        throw new BadRequestException('Smart contract error occurred');
      }

      throw new InternalServerErrorException('Failed to register land on blockchain');
    }
  }

  /**
   * Get current wallet balance (ETH)
   */
  async getWalletBalanceEth(): Promise<string> {
    try {
      const balanceWei = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balanceWei);
    } catch (error) {
      this.logger.error('Failed to fetch wallet balance:', error);
      throw new InternalServerErrorException('Failed to fetch wallet balance');
    }
  }

  /**
   * Estimate total transaction cost for registerLand(cid)
   * Returns gas, gasPrice and total cost in wei (as bigint) and ETH string
   */
  async estimateRegisterLandCost(cid: string): Promise<{
    gasLimit: bigint;
    gasPriceWei: bigint;
    totalCostWei: bigint;
    totalCostEth: string;
  }> {
    try {
      const gasLimit = await this.contract.registerLand.estimateGas(cid);
      const feeData = await this.provider.getFeeData();
      const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
      const totalCostWei = gasLimit * gasPriceWei;
      const totalCostEth = ethers.formatEther(totalCostWei);
      return { gasLimit, gasPriceWei, totalCostWei, totalCostEth };
    } catch (error) {
      this.logger.error('Failed to estimate registerLand gas:', error);

      // Proper type checking for ethers.js errors
      const ethersError = error as {
        code?: string;
        shortMessage?: string;
        message?: string;
      };

      // Check if this is an insufficient balance error
      if (
        ethersError.code === 'CALL_EXCEPTION' &&
        (ethersError.shortMessage?.includes('execution reverted') ||
          ethersError.message?.includes('execution reverted'))
      ) {
        const walletAddress = this.wallet.address;
        const balanceEth = await this.getWalletBalanceEth();
        throw new BadRequestException(
          `Insufficient balance in wallet ${walletAddress}. Current balance: ${balanceEth} ETH. Please add funds to complete the transaction.`,
        );
      }

      throw new InternalServerErrorException('Failed to estimate transaction gas');
    }
  }

  /**
   * Update property metadata on the blockchain
   * @param tokenId Token ID of the property to update
   * @param newCid New IPFS Content Identifier
   * @returns Transaction result
   */
  async updateProperty(tokenId: number, newCid: string): Promise<{ hash: string }> {
    try {
      this.logger.log(`Updating property ${tokenId} with new CID: ${newCid}`);

      // Check if property exists
      try {
        await this.contract.ownerOf(tokenId);
      } catch {
        throw new BadRequestException('Property not found');
      }

      // Check if new CID is already used
      const isCIDUsed = (await this.contract.isCIDUsed(newCid)) as boolean;
      if (isCIDUsed) {
        throw new BadRequestException('New CID is already used');
      }

      // Execute the transaction
      const tx = (await this.contract.updateProperty(
        tokenId,
        newCid,
      )) as ethers.TransactionResponse;
      this.logger.log(`Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      const receipt = (await tx.wait()) as ethers.TransactionReceipt;

      if (receipt.status !== 1) {
        throw new InternalServerErrorException('Transaction failed');
      }

      this.logger.log(`Property ${tokenId} updated successfully`);

      return {
        hash: tx.hash,
      };
    } catch (error) {
      this.logger.error(`Failed to update property ${tokenId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle smart contract errors
      if ((error as { code?: string }).code === 'CALL_EXCEPTION') {
        throw new BadRequestException('Smart contract error occurred');
      }

      throw new InternalServerErrorException('Failed to update property on blockchain');
    }
  }

  /**
   * Get property information from the blockchain
   * @param tokenId Token ID of the property
   * @returns Property information
   */
  async getProperty(tokenId: number): Promise<{ tokenId: number; cid: string; landOwner: string }> {
    try {
      this.logger.log(`Getting property information for token ID: ${tokenId}`);

      const property = (await this.contract.getProperty(tokenId)) as {
        tokenId: bigint;
        cid: string;
        landOwner: string;
      };

      return {
        tokenId: Number(property.tokenId),
        cid: property.cid,
        landOwner: property.landOwner,
      };
    } catch (error) {
      this.logger.error(`Failed to get property ${tokenId}:`, error);

      // Handle smart contract errors
      if ((error as { code?: string }).code === 'CALL_EXCEPTION') {
        throw new BadRequestException('Property not found');
      }

      throw new InternalServerErrorException('Failed to get property from blockchain');
    }
  }

  /**
   * Check if a CID is already used on the blockchain
   * @param cid IPFS Content Identifier
   * @returns True if CID is used, false otherwise
   */
  async isCIDUsed(cid: string): Promise<boolean> {
    try {
      return (await this.contract.isCIDUsed(cid)) as boolean;
    } catch (error) {
      this.logger.error(`Failed to check CID usage: ${cid}`, error);
      throw new InternalServerErrorException('Failed to check CID usage');
    }
  }

  /**
   * Get the next token ID that will be assigned
   * @returns Next token ID
   */
  async getNextTokenId(): Promise<number> {
    try {
      const nextTokenId = (await this.contract.getNextTokenId()) as bigint;
      return Number(nextTokenId);
    } catch (error) {
      this.logger.error('Failed to get next token ID:', error);
      throw new InternalServerErrorException('Failed to get next token ID');
    }
  }

  /**
   * Get ownership history for a property using Moralis API
   * @param propertyId Property ID to get ownership history for
   * @returns Ownership history data
   */
  async getPropertyOwnershipHistory(propertyId: string): Promise<{
    propertyId: string;
    tokenId: number;
    ownershipHistory: Array<{
      fromAddress: string;
      toAddress: string;
      transactionHash: string;
      blockNumber: number;
      timestamp: string;
      eventType: 'MINT' | 'TRANSFER';
    }>;
  }> {
    try {
      this.logger.log(`Getting ownership history for property: ${propertyId}`);

      // Get property from database to get tokenId and transactionHash
      const property = await this.prisma.property.findUnique({
        where: { propertyId },
        select: { tokenId: true, transactionHash: true, createdAt: true },
      });

      if (!property) {
        this.logger.error(`Property not found: ${propertyId}`);
        throw new BadRequestException(`Property with ID ${propertyId} not found`);
      }

      if (!property.tokenId) {
        this.logger.error(`Property ${propertyId} is not registered on blockchain (no tokenId)`);
        throw new BadRequestException(`Property ${propertyId} is not registered on blockchain`);
      }

      const tokenId = property.tokenId;
      const contractAddress = this.contractAddress;

      const moralisApiKey = process.env.MORALIS_API_KEY;
      if (!moralisApiKey) {
        this.logger.error('Moralis API key not configured in environment variables');
        throw new InternalServerErrorException('Moralis API key not configured');
      }

      const moralisUrl = `https://deep-index.moralis.io/api/v2.2/nft/${contractAddress}/${tokenId}/transfers?chain=sepolia&format=decimal`;

      this.logger.log(`Fetching ownership history from Moralis: ${moralisUrl}`);

      // HTTP GET request to Moralis API
      const response = await fetch(moralisUrl, {
        headers: {
          'X-API-Key': moralisApiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Moralis API error: ${response.status} - ${errorText}`);
        throw new InternalServerErrorException(
          `Failed to fetch data from Moralis API: ${response.status} - ${errorText}`,
        );
      }

      const moralisData = (await response.json()) as MoralisApiResponse;

      this.logger.log(`Moralis API response: ${JSON.stringify(moralisData)}`);

      // Check if we have results
      if (
        !moralisData.result ||
        !Array.isArray(moralisData.result) ||
        moralisData.result.length === 0
      ) {
        this.logger.warn(
          `No transfer history found for token ${tokenId}. Response: ${JSON.stringify(moralisData)}`,
        );

        // If no transfers found, Get the current owner from the blockchain and create a basic registration record
        let currentOwner = 'Unknown';
        try {
          const blockchainProperty = await this.getProperty(tokenId);
          currentOwner = blockchainProperty.landOwner;
        } catch (error) {
          this.logger.warn(`Failed to get current owner for token ${tokenId}:`, error);
        }

        const initialRecord = {
          fromAddress: '0x0000000000000000000000000000000000000000',
          toAddress: currentOwner,
          transactionHash: property.transactionHash || '',
          blockNumber: 0,
          timestamp: property.createdAt.toISOString(),
          eventType: 'MINT' as const,
        };

        return {
          propertyId,
          tokenId,
          ownershipHistory: [initialRecord],
        };
      }

      this.logger.log(`Found ${moralisData.result.length} transfer records for token ${tokenId}`);

      // Process Moralis data into our format
      const ownershipHistory = moralisData.result.map((transfer: MoralisTransfer) => ({
        fromAddress: transfer.from_address || '0x0000000000000000000000000000000000000000',
        toAddress: transfer.to_address || '',
        transactionHash: transfer.transaction_hash || '',
        blockNumber: parseInt(transfer.block_number) || 0,
        timestamp: transfer.block_timestamp || new Date().toISOString(),
        eventType:
          transfer.from_address === '0x0000000000000000000000000000000000000000'
            ? ('MINT' as const)
            : ('TRANSFER' as const),
      }));

      // Sort by block number (newest first for current owner to be at top)
      ownershipHistory.sort((a, b) => b.blockNumber - a.blockNumber);

      this.logger.log(`Found ${ownershipHistory.length} ownership events for token ${tokenId}`);

      return {
        propertyId,
        tokenId,
        ownershipHistory,
      };
    } catch (error) {
      this.logger.error(`Failed to get ownership history for property ${propertyId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to get property ownership history');
    }
  }
}
