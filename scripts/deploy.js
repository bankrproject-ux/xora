const hre = require("hardhat");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = 4663;

const PAYOUT_WALLET =
  "0xF91Cdf37C9B3560bfee8DaB7c8fe88a5B250681c";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(question);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";

    const onData = key => {
      if (key === "\u0003") {
        stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        process.exit(1);
      }

      if (key === "\r" || key === "\n") {
        stdout.write("\n");

        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);

        resolve(input.trim());
        return;
      }

      if (key === "\u007f") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write("\b \b");
        }

        return;
      }

      input += key;
      stdout.write("*");
    };

    stdin.on("data", onData);
  });
}

async function waitForReceipt(provider, txHash) {
  while (true) {
    const receipt = await provider.getTransactionReceipt(txHash);

    if (receipt) {
      return receipt;
    }

    process.stdout.write(".");
    await sleep(3000);
  }
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("          AXORA MAINNET DEPLOY");
  console.log("========================================");
  console.log("");

  console.log("Network      : Robinhood Chain");
  console.log("Chain ID     :", CHAIN_ID);
  console.log("RPC          :", RPC_URL);
  console.log("Payout wallet:", PAYOUT_WALLET);
  console.log("");

  console.log("NFT Supply   : 900");
  console.log("Epoch 1      : 300 @ 0.0005 ETH");
  console.log("Epoch 2      : 300 @ 0.001 ETH");
  console.log("Epoch 3      : 300 @ 0.002 ETH");
  console.log("Claim Window : 60 seconds");
  console.log("");

  console.log("WARNING:");
  console.log("This is MAINNET.");
  console.log("The contract deployment is permanent.");
  console.log("");

  const confirm = await ask(
    'Type "DEPLOY AXORA" to continue: '
  );

  if (confirm !== "DEPLOY AXORA") {
    console.log("");
    console.log("Deployment cancelled.");
    process.exit(0);
  }

  console.log("");

  const privateKey = await askHidden(
    "Enter deployer private key: "
  );

  if (!privateKey) {
    throw new Error("Private key is required.");
  }

  const normalizedKey = privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;

  console.log("");
  console.log("Connecting to Robinhood Chain...");

  const provider =
    new hre.ethers.JsonRpcProvider(
      RPC_URL,
      {
        name: "Robinhood Chain",
        chainId: CHAIN_ID
      }
    );

  const wallet =
    new hre.ethers.Wallet(
      normalizedKey,
      provider
    );

  const deployerAddress =
    await wallet.getAddress();

  const balance =
    await provider.getBalance(
      deployerAddress
    );

  console.log("");
  console.log("Deployer:", deployerAddress);
  console.log(
    "Balance :",
    hre.ethers.formatEther(balance),
    "ETH"
  );
  console.log("");

  if (balance === 0n) {
    throw new Error(
      "Deployer has no ETH on Robinhood Chain."
    );
  }

  console.log("Checking network...");

  const network =
    await provider.getNetwork();

  if (network.chainId !== BigInt(CHAIN_ID)) {
    throw new Error(
      `Wrong chain. Expected ${CHAIN_ID}, got ${network.chainId}`
    );
  }

  console.log("Network OK.");
  console.log("");

  console.log("Loading contract...");

  const artifact =
    await hre.artifacts.readArtifact("Axora");

  const factory =
    new hre.ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet
    );

  console.log("Deploying AXORA...");
  console.log("");

  const contract =
    await factory.deploy(
      PAYOUT_WALLET
    );

  const deploymentTx =
    contract.deploymentTransaction();

  console.log(
    "Transaction:",
    deploymentTx.hash
  );

  console.log("");
  console.log(
    "Waiting for confirmation"
  );

  const receipt =
    await waitForReceipt(
      provider,
      deploymentTx.hash
    );

  const contractAddress =
    await contract.getAddress();

  console.log("");
  console.log("");
  console.log("========================================");
  console.log("          DEPLOYMENT SUCCESS");
  console.log("========================================");
  console.log("");
  console.log(
    "Contract:",
    contractAddress
  );
  console.log(
    "TX Hash :",
    deploymentTx.hash
  );
  console.log(
    "Block   :",
    receipt.blockNumber
  );
  console.log("");
  console.log(
    "Explorer:"
  );
  console.log(
    `https://robinhoodchain.blockscout.com/address/${contractAddress}`
  );
  console.log("");

  const deploymentInfo = {
    network: "Robinhood Chain",
    chainId: CHAIN_ID,
    contract: contractAddress,
    deployer: deployerAddress,
    payoutWallet: PAYOUT_WALLET,
    transactionHash: deploymentTx.hash,
    blockNumber: receipt.blockNumber,
    name: "AXORA",
    symbol: "AXR",
    maxSupply: 900,
    epochSize: 300,
    prices: {
      epoch1: "0.0005 ETH",
      epoch2: "0.001 ETH",
      epoch3: "0.002 ETH"
    },
    claimWindow: 60,
    artworkCID:
      "bafkreieae5u77f6p4puvwzk6e256g6aerz3wd5dixrpo7bhu7d323ievqe"
  };

  const outputDir =
    path.join(process.cwd(), "deployments");

  fs.mkdirSync(
    outputDir,
    { recursive: true }
  );

  fs.writeFileSync(
    path.join(
      outputDir,
      "robinhood-mainnet.json"
    ),
    JSON.stringify(
      deploymentInfo,
      null,
      2
    )
  );

  console.log(
    "Deployment info saved to:"
  );

  console.log(
    "deployments/robinhood-mainnet.json"
  );

  console.log("");
  console.log(
    "PRIVATE KEY WAS NOT SAVED."
  );
  console.log("");
}

main().catch(error => {
  console.error("");
  console.error("========================================");
  console.error("             DEPLOY FAILED");
  console.error("========================================");
  console.error("");
  console.error(error.message || error);
  console.error("");

  process.exitCode = 1;
});
