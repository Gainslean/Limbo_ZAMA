const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const ERC = await hre.ethers.getContractFactory("CustomERC20");
  const leth = await ERC.deploy("Limbo ETH", "LETH", 18, deployer.address);
  await leth.deployed();

  const lusdt = await ERC.deploy("Limbo USDT", "LUSDT", 18, deployer.address);
  await lusdt.deployed();

  const Limbo = await hre.ethers.getContractFactory("LimboMain");
  const limbo = await Limbo.deploy(leth.address, lusdt.address);
  await limbo.deployed();

  await (await leth.transferOwnership(limbo.address)).wait();
  await (await lusdt.transferOwnership(limbo.address)).wait();

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const chainIdHex = "0x" + chainId.toString(16);

  const payload = {
    LETH: leth.address,
    LUSDT: lusdt.address,
    LIMBO: limbo.address,
    chainId,
    chainIdHex,
    chainName: process.env.CHAIN_NAME || "Zama Devnet",
    symbol: process.env.CHAIN_SYMBOL || "ZAMA",
    rpcUrl: process.env.RPC_URL
  };

  console.log(JSON.stringify(payload));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
