const hre = require("hardhat");
const readline = require("readline");

const RPC_URL = "https://robinhood-mainnet.g.alchemy.com/v2/QMLUNIOgb3SPxMycEEAKj";
const CHAIN_ID = 4663;

const PAYOUT_WALLET =
  "0xF91Cdf37C9B3560bfee8DaB7c8fe88a5B250681c";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
}

async function askPrivateKey() {
  return new Promise(resolve => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write("Private Key: ");

    let input = "";

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function onData(key) {
      // CTRL+C
      if (key === "\u0003") {
        stdout.write("\nCancelled.\n");

        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);

        resolve(null);
        return;
      }

      // ENTER
      if (key === "\r" || key === "\n") {
        stdout.write("\n");

        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);

        resolve(input.trim());
        return;
      }

      // BACKSPACE
      if (key === "\u007f") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write("\b \b");
        }

        return;
      }

      input += key;
      stdout.write("*");
    }

    stdin.on("data", onData);
  });
}

async function waitForReceipt(provider, txHash) {
  while (true) {
    const receipt =
      await provider.getTransactionReceipt(txHash);

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

  console.log("========================================");
  console.log("WARNING: MAINNET DEPLOYMENT");
  console.log("========================================");
  console.log("");

  const rl = createInterface();

  const confirm = await ask(
    rl,
    "Continue deployment? (Y/N): "
  );

  rl.close();

  if (
    confirm.toLowerCase() !== "y" &&
    confirm.toLowerCase() !== "yes"
  ) {
    console.log("");
    console.log("Deployment cancelled.");
    return;
  }

  console.log("");
  console.log("Enter deployer private key.");
  console.log("It will NOT be saved to a file.");
  console.log("");

  const privateKey = await askPrivateKey();

  if (!privateKey) {
    console.log("Deployment cancelled.");
    return;
  }

  const normalizedKey =
    privateKey.startsWith("0x")
      ? privateKey
      : `0x${privateKey}`;

  /*
   * Clear the variable containing the original
   * user input as soon as possible.
   */
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

  let wallet;

  try {
    wallet =
      new hre.ethers.Wallet(
        normalizedKey,
        provider
      );
  } catch {
    throw new Error(
      "Invalid private key."
    );
  }

  const deployerAddress =
    await wallet.getAddress();

  console.log("");
  console.log(
    "Deployer:",
    deployerAddress
  );

  const network =
    await provider.getNetwork();

  console.log(
    "Connected chain:",
    network.chainId.toString()
  );

  if (
    network.chainId !== BigInt(CHAIN_ID)
  ) {
    throw new Error(
      `Wrong chain. Expected ${CHAIN_ID}, got ${network.chainId}`
    );
  }

  const balance =
    await provider.getBalance(
      deployerAddress
    );

  console.log(
    "Balance:",
    hre.ethers.formatEther(balance),
    "ETH"
  );

  if (balance === 0n) {
    throw new Error(
      "Deployer wallet has no ETH."
    );
  }

  console.log("");
  console.log("Compiling/loading AXORA contract...");

  const artifact =
    await hre.artifacts.readArtifact(
      "Axora"
    );

  const factory =
    new hre.ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet
    );

  console.log("");
  console.log("Deploying AXORA...");
  console.log("");

  const contract =
    await factory.deploy(
      PAYOUT_WALLET
    );

  const deploymentTx =
    contract.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error(
      "Deployment transaction was not created."
    );
  }

  console.log(
    "TX:",
    deploymentTx.hash
  );

  console.log("");
  console.log(
    "Waiting for blockchain confirmation"
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
  console.log("       AXORA DEPLOYMENT SUCCESS");
  console.log("========================================");
  console.log("");

  console.log(
    "Contract:",
    contractAddress
  );

  console.log(
    "TX Hash:",
    deploymentTx.hash
  );

  console.log(
    "Block:",
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

  console.log(
    "Payout wallet:",
    PAYOUT_WALLET
  );

  console.log("");

  console.log(
    "900 AXORA NFTs are now deployed."
  );

  console.log("");

  /*
   * The private key is never written anywhere.
   *
   * We also overwrite local references before finishing.
   */
  wallet = null;
}

main().catch(error => {
  console.log("");
  console.log("========================================");
  console.log("           DEPLOYMENT FAILED");
  console.log("========================================");
  console.log("");

  console.error(
    error.message || error
  );

  console.log("");

  process.exitCode = 1;
});
