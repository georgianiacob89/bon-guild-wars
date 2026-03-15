// ====================================================================
// SCRIPT 2: DISTRIBUTE FUNDS
// ====================================================================
// Usage:
//   Window A (4 EGLD each):  node 2-distribute-funds.js A
//   Window B (1 EGLD each):  node 2-distribute-funds.js B
// ====================================================================

const { UserSigner } = require("@multiversx/sdk-wallet");
const { Transaction, TransactionComputer, Address, Account } = require("@multiversx/sdk-core");
const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");
const fs = require("fs");
const config = require("./config");

const BATCH_SIZE = 100;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function distributeFunds() {
  const window = (process.argv[2] || "A").toUpperCase();
  const perWallet = window === "B" ? config.EGLD_PER_WALLET_B : config.EGLD_PER_WALLET_A;
  const perWalletEGLD = Number(BigInt(perWallet)) / 1e18;

  console.log(`\n💰 DISTRIBUTE — WINDOW ${window}\n`);
  console.log(`   Per wallet: ${perWalletEGLD} EGLD`);

  const masterPem = fs.readFileSync(config.MASTER_PEM_PATH, "utf8");
  const masterSigner = UserSigner.fromPem(masterPem);
  const masterBech32 = masterSigner.getAddress().bech32();
  const masterCoreAddr = Address.newFromBech32(masterBech32);

  console.log(`📍 Master: ${masterBech32}`);

  const provider = new ProxyNetworkProvider(config.GATEWAY_URL);
  const masterOnNet = await provider.getAccount(masterCoreAddr);
  const masterAccount = new Account(masterCoreAddr);
  masterAccount.update(masterOnNet);

  const balance = BigInt(masterOnNet.balance.toString());
  console.log(`💰 Balance: ${(Number(balance) / 1e18).toFixed(4)} EGLD`);
  console.log(`🔢 Nonce: ${masterAccount.nonce}`);

  const wallets = JSON.parse(fs.readFileSync(config.WALLETS_INDEX_FILE, "utf8"));
  const totalNeeded = BigInt(perWallet) * BigInt(wallets.length);
  console.log(`📊 Funding ${wallets.length} wallets (${(Number(totalNeeded) / 1e18).toFixed(0)} EGLD needed)\n`);

  if (balance < totalNeeded) {
    console.error(`❌ Need ${(Number(totalNeeded) / 1e18).toFixed(0)} EGLD, have ${(Number(balance) / 1e18).toFixed(4)} EGLD`);
    process.exit(1);
  }

  const txComputer = new TransactionComputer();
  const totalBatches = Math.ceil(wallets.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = wallets.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    console.log(`📦 Batch ${b + 1}/${totalBatches} (${batch.length} wallets)`);

    const txs = [];
    for (const w of batch) {
      const tx = new Transaction({
        nonce: masterAccount.nonce,
        value: BigInt(perWallet),
        receiver: w.address,
        sender: masterBech32,
        gasLimit: config.TX_GAS_LIMIT,
        gasPrice: config.TX_GAS_PRICE,
        chainID: config.CHAIN_ID,
      });
      tx.signature = await masterSigner.sign(txComputer.computeBytesForSigning(tx));
      txs.push(tx);
      masterAccount.incrementNonce();
    }

    try {
      await provider.sendTransactions(txs);
      console.log(`  ✅ Sent!`);
    } catch (err) {
      console.error(`  ❌ Bulk failed: ${err.message}`);
      console.log(`  🔄 Individual sends...`);
      let ok = 0, fail = 0;
      for (const tx of txs) {
        try { await provider.sendTransaction(tx); ok++; } catch { fail++; }
      }
      console.log(`  📊 ${ok} ok, ${fail} failed`);
    }

    if (b < totalBatches - 1) {
      console.log(`  ⏳ Waiting ${config.BATCH_DELAY_MS / 1000}s...`);
      await sleep(config.BATCH_DELAY_MS);
      try {
        const r = await provider.getAccount(masterCoreAddr);
        const nn = BigInt(r.nonce.toString());
        if (nn > masterAccount.nonce) masterAccount.nonce = nn;
      } catch {}
    }
  }

  console.log(`\n✅ Window ${window} distribution complete!`);
  console.log(`💡 Run: npm run check\n`);
}

distributeFunds().catch(e => { console.error("❌", e); process.exit(1); });
