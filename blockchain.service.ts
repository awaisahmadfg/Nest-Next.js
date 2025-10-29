import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join } from "path";

export class BlockchainService {
  private provider!: ethers.Provider;
  private wallet!: ethers.Wallet;
  private contract!: ethers.Contract;
  private contractAddress!: string;

  constructor() {
    this.initializeBlockchain();
  }

  private initializeBlockchain() {
    try {
      // Get configuration from environment variables
      const rpcUrl = process.env.INFURA_RPC_URL;
      const privateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
      const contractAddress = process.env.SMART_TAGS_CONTRACT_ADDRESS;

      if (!privateKey) {
        throw new Error(
          "MASTER_WALLET_PRIVATE_KEY environment variable is required"
        );
      }

      if (!contractAddress) {
        throw new Error(
          "SMART_TAGS_CONTRACT_ADDRESS environment variable is required"
        );
      }

      // Load SmartTags ABI from file with multiple path fallbacks
      const SmartTagsABI = this.loadSmartTagsABI();

      // Initialize provider and wallet
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      // Initialize contract
      this.contract = new ethers.Contract(
        contractAddress,
        SmartTagsABI,
        this.wallet
      );
      this.contractAddress = contractAddress;

      console.log("Blockchain service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize blockchain service:", error);
      throw new Error("Blockchain service initialization failed");
    }
  }

  private loadSmartTagsABI(): ethers.InterfaceAbi {
    // Multiple path fallbacks to handle different environments
    const candidatePaths = [
      // For Lambda runtime and local development (single src structure)
      join(process.cwd(), "src/contracts/abis/SmartTags.json"),
      // Alternative paths
      join(__dirname, "../../contracts/abis/SmartTags.json"),
      join(__dirname, "../../../contracts/abis/SmartTags.json"),
    ];

    for (const abiPath of candidatePaths) {
      try {
        console.log(`Attempting to load ABI from: ${abiPath}`);
        const abiData = readFileSync(abiPath, "utf8");
        const abi = JSON.parse(abiData);
        console.log(`Successfully loaded SmartTags ABI from: ${abiPath}`);
        return abi as ethers.InterfaceAbi;
      } catch (error) {
        console.log(
          `Failed to load ABI from ${abiPath}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
        continue;
      }
    }

    throw new Error(
      `SmartTags ABI file not found. Tried paths: ${candidatePaths.join(", ")}`
    );
  }

  async registerLand(cid: string): Promise<{ hash: string; tokenId: number }> {
    try {
      console.log(`Registering land with CID: ${cid}`);

      // Check if CID is already used
      const isCIDUsed = await this.contract.isCIDUsed(cid);
      if (isCIDUsed) {
        throw new Error("CID is already used");
      }

      // Register the land
      const tx = await this.contract.registerLand(cid);
      console.log(`Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        throw new Error("Transaction failed");
      }

      // Get the token ID from the event or contract
      let tokenId: number;
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed?.name === "PropertyRegistered";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = this.contract.interface.parseLog(event);
        if (parsed?.args && "tokenId" in parsed.args) {
          tokenId = Number(parsed.args.tokenId);
        } else {
          // Fallback: get next token ID and subtract 1
          const nextTokenId = await this.contract.getNextTokenId();
          tokenId = Number(nextTokenId) - 1;
        }
      } else {
        // Fallback: get next token ID and subtract 1
        const nextTokenId = await this.contract.getNextTokenId();
        tokenId = Number(nextTokenId) - 1;
      }

      console.log(`Property registered successfully with token ID: ${tokenId}`);
      return { hash: tx.hash, tokenId };
    } catch (error) {
      console.error("Failed to register land:", error);
      throw new Error(
        `Failed to register land on blockchain: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async getWalletBalanceEth(): Promise<string> {
    try {
      const balanceWei = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balanceWei);
    } catch (error) {
      console.error("Failed to fetch wallet balance:", error);
      throw new Error("Failed to fetch wallet balance");
    }
  }

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
      console.error("Failed to estimate registerLand gas:", error);
      const ethersError = error as {
        code?: string;
        shortMessage?: string;
        message?: string;
      };

      if (
        ethersError.code === "CALL_EXCEPTION" &&
        (ethersError.shortMessage?.includes("execution reverted") ||
          ethersError.message?.includes("execution reverted"))
      ) {
        const walletAddress = this.wallet.address;
        const balanceEth = await this.getWalletBalanceEth();
        throw new Error(
          `Insufficient balance in wallet ${walletAddress}. Current balance: ${balanceEth} ETH. Please add funds to complete the transaction.`
        );
      }

      throw new Error("Failed to estimate transaction gas");
    }
  }

  async ensureSufficientBalanceForRegisterLand(cid: string): Promise<void> {
    const [balanceEth, estimate] = await Promise.all([
      this.getWalletBalanceEth(),
      this.estimateRegisterLandCost(cid),
    ]);

    const balanceWei = ethers.parseEther(balanceEth);
    if (balanceWei < estimate.totalCostWei) {
      const walletAddress = this.wallet.address;
      throw new Error(
        `Insufficient balance in wallet ${walletAddress}. Current balance: ${balanceEth} ETH. Please add funds to complete the transaction.`
      );
    }
  }
}
