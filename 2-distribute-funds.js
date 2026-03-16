// ====================================================================
// SCRIPT 2: DISTRIBUTE FUNDS
// ====================================================================

const { UserSigner } = require("@multiversx/sdk-wallet");
const { Transaction, Address, Account } = require("@multiversx/sdk-core");
const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");
const fs = require("fs");
const path = require('path');
const config = require("./config");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const windowArg = (process.argv[2] || "A").toUpperCase(); // 'A' or 'B'
  let perWallet;

  if (windowArg === "A") {
    perWallet = BigInt(config.EGLD_PER_WALLET_A);
  } else {
    perWallet = BigInt(config.EGLD_PER_WALLET_B);
  }

  const perWalletEGLD = Number(perWallet) / 1e18;

  console.log(`\n💰 DISTRIBUTE — WINDOW ${windowArg}`);
  console.log(`   Per wallet: ${perWalletEGLD} EGLD`);

  // Load Master Wallet
  const masterPemPath = path.resolve(config.MASTER_PEM_PATH);
  const masterPem = fs.readFileSync(masterPemPath, "utf8");
  const masterSigner = UserSigner.fromPem(masterPem);
  const masterBech32 = masterSigner.getAddress().bech32();
  const masterAddress = new Address(masterBech32);

  console.log(`📍 Master: ${masterBech32}`);

  // Setup Provider
  const provider = new ProxyNetworkProvider(config.GATEWAY_URL, { timeout: 10000 });
  const wallets = JSON.parse(fs.readFileSync(config.WALLETS_INDEX_FILE, "utf8"));

  // Check Master Balance & Nonce
  let masterAccount = await provider.getAccount(masterAddress);
  let masterNonce = BigInt(masterAccount.nonce.valueOf());
  
  console.log(`🔢 Master Nonce: ${masterNonce}`);

  // === MAIN LOOP: CHECK -> SEND -> REPEAT ===
  while (true) {
    console.log("\n🔍 CHECKING BALANCES (This might take a moment)...");
    
    // 1. Identify wallets that need funds (balance < 50% of target)
    // We check in parallel chunks to speed up
    const needyWallets = [];
    const CHUNK = 50;
    
    // We define a threshold. If target is 4 EGLD, and they have 0, we send.
    // If they have 3.9, we skip.
    // Threshold = 90% of target amount
    const threshold = (perWallet * 90n) / 100n;

    for (let i = 0; i < wallets.length; i += CHUNK) {
      const chunk = wallets.slice(i, i + CHUNK);
      
      // Request balances in parallel
      await Promise.all(chunk.map(async (w) => {
        try {
          const acc = await provider.getAccount(new Address(w.address));
          // Handle 'e' notation if any weirdness (though SDK usually returns BigInt/string well)
          let balStr = acc.balance.toString();
          if (balStr.includes('e')) {
              balStr = Number(balStr).toLocaleString('fullwide', { useGrouping: false });
          }
          const bal = BigInt(balStr);

          if (bal < threshold) {
             needyWallets.push(w);
          }
        } catch (e) {
          // If error fetching balance, assume we need to check/send later.
          // But safer to just skip and retry check next loop so we don't blind send.
          // Actually, if network error, we probably can't send anyway.
          console.log(`⚠️  Error checking ${w.address}: ${e.message}`);
          needyWallets.push(w); 
        }
      }));
      
      process.stdout.write(`   Scanned ${Math.min(i + CHUNK, wallets.length)}/${wallets.length}\r`);
    }

    if (needyWallets.length === 0) {
      console.log(`\n\n✅ ALL ${wallets.length} WALLETS ARE FUNDED! EXITING.`);
      process.exit(0);
    }

    console.log(`\n\n❌ MISSING FUNDS: ${needyWallets.length} wallets.`);
    console.log(`🚀 Starting distribution round for missing wallets...`);
    
    // Refresh nonce just in case
    masterAccount = await provider.getAccount(masterAddress);
    masterNonce = BigInt(masterAccount.nonce.valueOf());

    // 2. Distribute in batches of 50
    const SEND_BATCH = 50; 
    for (let i = 0; i < needyWallets.length; i += SEND_BATCH) {
        const batch = needyWallets.slice(i, i + SEND_BATCH);
        const txs = [];

        for (const w of batch) {
            const tx = new Transaction({
                nonce: masterNonce,
                value: perWallet,
                receiver: new Address(w.address),
                sender: masterAddress,
                gasLimit: 50000n, // Min for transfer
                gasPrice: 1000000000n, // 1 Gwei
                chainID: config.CHAIN_ID,
            });

            // Sign
            const serialized = tx.serializeForSigning();
            const signature = await masterSigner.sign(serialized);
            tx.applySignature(signature);

            txs.push(tx);
            masterNonce++;
        }

        // Broadcast
        try {
            const hashes = await provider.sendTransactions(txs);
            console.log(`   ✅ Sent batch ${i}-${i+batch.length} (${hashes.length} txs).`);
        } catch (e) {
            console.log(`   ⚠️ Batch failed: ${e.message}`);
        }
        
        // Wait between batches to let network update nonce
        await sleep(2000); 
    }

    console.log(`\n⏳ Validating round complete. Waiting 10s before re-check...`);
    await sleep(10000);
  }
}

main().catch((e) => {
  console.error("CRITICAL ERROR:", e);
  process.exit(1);
});
