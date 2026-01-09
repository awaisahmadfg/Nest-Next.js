

require('dotenv').config();
const { ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());

  // Deploy SmartTags implementation and proxy
  console.log("\n=== Deploying SmartTags (UUPS) ===");
  const SmartTags = await ethers.getContractFactory("SmartTags");
  
  // Deploy Implementation
  const implementation = await SmartTags.deploy();
  await implementation.deployed();
  console.log("SmartTags Implementation deployed to:", implementation.address);
  
  // ✅ Prepare initialize data WITH superAdmin (required by your contract)
  const initializeData = implementation.interface.encodeFunctionData(
    "initialize",
    [deployer.address]          // superAdmin
  );
  
  // Deploy Proxy
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await ERC1967Proxy.deploy(implementation.address, initializeData);
  await proxy.deployed();
  const proxyAddress = proxy.address; 
  console.log("SmartTags Proxy deployed to:", proxyAddress);

  // Wait for block confirmations (works on any network)
  console.log("\nWaiting for block confirmations...");
  await implementation.deployTransaction.wait(5);
  await proxy.deployTransaction.wait(5);

  // Verify Implementation
  console.log("\n=== Verifying Implementation ===");
  try {
    await hre.run("verify:verify", {
      address: implementation.address,
      constructorArguments: [],
    });
    console.log("✅ Implementation verified");
  } catch (e) {
    if (e.message.includes("Already Verified") || e.message.includes("already verified")) {
      console.log("✅ Implementation already verified");
    } else {
      console.log("⚠️  Implementation verification:", e.message);
    }
  }

  // Verify Proxy
  console.log("\n=== Verifying Proxy ===");
  try {
    await hre.run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [implementation.address, initializeData],
    });
    console.log("✅ Proxy verified");
  } catch (e) {
    if (e.message.includes("Already Verified") || e.message.includes("already verified")) {
      console.log("✅ Proxy already verified");
    } else {
      console.log("⚠️  Proxy verification:", e.message);
    }
  }

  console.log("\n=== Deployment Summary ===");
  console.log("Network:", network.name);
  console.log("SmartTags Proxy Address:", proxyAddress);
  console.log("SmartTags Implementation Address:", implementation.address);
  console.log("\n✅ Deployment and verification successful!");

  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    proxyAddress: proxyAddress,
    implementationAddress: implementation.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  console.log("\n=== Deployment Info ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
