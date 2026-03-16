// ====================================================================
// SCRIPT 3: TRANSACTION SPRINT — MAX SPEED RING (SUPERNOVA EDITION)
// ====================================================================

const { UserSigner } = require("@multiversx/sdk-wallet");
const { Transaction, TransactionComputer, Address, Account } = require("@multiversx/sdk-core");
const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");
const fs = require("fs");
const config = require("./config");
const { setTimeout: sleep } = require("timers/promises");

// --- STATE ---
let totalSent = 0;
let totalConfirmed = 0; // Tracked by nonce increments
let startTime = null;
let isRunning = true;

// --- CONFIG ---
const FEE = BigInt(config.TX_GAS_LIMIT) * BigInt(config.TX_GAS_PRICE);
const TOTAL_MEMBERS = 5;
const memberArg = process.argv.indexOf("--member");
const memberIdx = memberArg !== -1 ? parseInt(process.argv[memberArg + 1]) : 0;
const shardArg = process.argv.indexOf("--shard");
const targetShard = shardArg !== -1 ? parseInt(process.argv[shardArg + 1]) : -1;
const capArg = process.argv.indexOf("--cap");
const TX_CAP = capArg !== -1 ? parseInt(process.argv[capArg + 1]) : 0;
const WORKER_CONCURRENCY = 500; // Run all wallets concurrently (Node handles IO well)

async function main() {
  console.log("\n⚔️  SUPERNOVA TRANSACTION SPRINT ⚔️\n");
  console.log(`📡 Gateway: ${config.GATEWAY_URL}`);
  console.log(`⛓️  Chain ID: ${config.CHAIN_ID}`);
  console.log(`⚡ Concurrency: ${WORKER_CONCURRENCY}`);
  if (targetShard !== -1) {
    console.log(`💎 MODE: SINGLE SHARD ${targetShard}`);
  }
  console.log(`🎯 Cap: ${TX_CAP === 0 ? "UNLIMITED" : TX_CAP.toLocaleString()}`);

  const allWallets = JSON.parse(fs.readFileSync(config.WALLETS_INDEX_FILE, "utf8"));
  let myWallets = allWallets;

  // Filter by Shard if requested
  if (targetShard !== -1) {
    myWallets = myWallets.filter(w => w.shard === targetShard);
    console.log(`🔍 Filtered for Shard ${targetShard}: ${myWallets.length} wallets found.`);
  }

  // Filter by Member (slices the remaining list)
  if (memberIdx >= 1 && memberIdx <= TOTAL_MEMBERS) {
    const per = Math.ceil(myWallets.length / TOTAL_MEMBERS);
    const start = (memberIdx - 1) * per;
    const slice = myWallets.slice(start, Math.min(start + per, myWallets.length));
    console.log(`👤 Member ${memberIdx}: Managing wallets ${start} - ${start + slice.length - 1} (of ${myWallets.length} in this shard)`);
    myWallets = slice;
  } else {
    if (targetShard === -1) {
       console.log(`👤 ALL IN: Managing ${myWallets.length} wallets`);
    } else {
       console.log(`👤 ALL IN (Shard ${targetShard}): Managing ${myWallets.length} wallets`);
    }
  }

  // Ring logic
  const shards = { 0: [], 1: [], 2: [] };
  allWallets.forEach(w => shards[w.shard].push(w));
  const receiverMap = new Map();
  for (const s of [0, 1, 2]) {
    const list = shards[s];
    if (list.length === 0) continue;
    for (let i = 0; i < list.length; i++) {
        receiverMap.set(list[i].address, list[(i + 1) % list.length].address);
    }
  }

  console.log("🔑 Loading signers...");
  const wallets = myWallets.map(w => {
    const pem = fs.readFileSync(w.pemFile, "utf8");
    const signer = UserSigner.fromPem(pem);
    const bech32 = signer.getAddress().bech32();
    return {
      ...w,
      signer,
      bech32,
      coreAddress: Address.newFromBech32(bech32),
      receiver: receiverMap.get(w.address) || w.address,
      nonce: 0n,
      balance: 0n
    };
  });

  const provider = new ProxyNetworkProvider(config.GATEWAY_URL, { timeout: 5000 });

  console.log("🔄 Initial sync...");
  await syncWallets(wallets, provider);
  
  const funded = wallets.filter(w => w.balance > FEE * 10n);
  console.log(`💰 Funded: ${funded.length} / ${wallets.length}`);
  if (funded.length === 0) {
    console.error("❌ No funded wallets. Aborting.");
    process.exit(1);
  }

  console.log("\n⏳ Press ENTER to start...");
  await new Promise(r => process.stdin.once("data", r));
  
  startTime = Date.now();
  console.log("\n🚀 LAUNCHING WORKERS 🚀\n");

  const statusInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const tps = totalSent / elapsed;
    const confirmedTps = totalConfirmed / elapsed;
    console.log(`[${elapsed.toFixed(0)}s] Sent: ${totalSent} | Confirmed(est): ${totalConfirmed} | TPS: ${tps.toFixed(0)}`);
  }, 2000);

  setTimeout(() => {
    console.log("⏰ Time Limit Reached!");
    isRunning = false;
  }, (config.WINDOW_DURATION_MINUTES || 30) * 60 * 1000).unref();

  // Launch all workers
  await Promise.all(funded.map(w => walletWorker(w, provider)));

  clearInterval(statusInterval);
  console.log("🏁 SPRINT FINISHED");
  process.exit(0);
}

async function walletWorker(wallet, provider) {
  const txc = new TransactionComputer();
  
  while (isRunning) {
    if (TX_CAP > 0 && totalSent >= TX_CAP) break;

    const startNonce = wallet.nonce;
    const count = parseInt(config.TXS_PER_BATCH || 100);
    
    // 1. Generate & Sign Batch
    const txs = [];
    for (let i = 0; i < count; i++) {
        const tx = new Transaction({
            nonce: startNonce + BigInt(i),
            value: BigInt(config.TX_VALUE),
            receiver: new Address(wallet.receiver),
            sender: wallet.coreAddress,
            gasLimit: config.TX_GAS_LIMIT,
            gasPrice: config.TX_GAS_PRICE,
            chainID: config.CHAIN_ID,
        });
        tx.signature = await wallet.signer.sign(txc.computeBytesForSigning(tx));
        txs.push(tx);
    }

    // 2. Send Batch
    try {
        await provider.sendTransactions(txs);
        totalSent += txs.length;
    } catch (e) {
        await sleep(200); 
    }

    // 3. Adaptive Wait
    await sleep(2000); // 2s wait (approx 3 blocks)

    // 4. Sync Nonce Loop
    let syncAttempts = 0;
    while (isRunning) {
        try {
            const acc = await provider.getAccount(wallet.coreAddress);
            const newNonce = BigInt(acc.nonce.toString());
            
            if (newNonce > startNonce) {
                const diff = Number(newNonce - startNonce);
                totalConfirmed += diff;
                wallet.nonce = newNonce; 
                break; // Proceed to next batch
            } else {
                syncAttempts++;
                if (syncAttempts > 5) {
                    // Timeout waiting for nonce move. Assume dropped. Retry sending same nonce?
                    // Actually, if we retry sending the SAME batch, we might get "nonce too low" errors for some, but 
                    // "nonce too low" is just rejected, "nonce gap" is stored.
                    // If we are here, it means startNonce is still valid on chain.
                    // So we can breal loop and RE-GENERATE from startNonce (retrying effectively)
                    break;
                }
                await sleep(500);
            }
        } catch (e) {
            await sleep(500);
        }
    }
  }
}

async function syncWallets(wallets, provider) {
  const BATCH = 50;
  for (let i = 0; i < wallets.length; i += BATCH) {
    const chunk = wallets.slice(i, i + BATCH);
    await Promise.all(chunk.map(async w => {
        try {
            const acc = await provider.getAccount(w.coreAddress);
            w.nonce = BigInt(acc.nonce.toString());
            let balanceStr = acc.balance.toString();
            if (balanceStr.includes("e")) balanceStr = Number(balanceStr).toLocaleString("fullwide", { useGrouping: false });
            w.balance = BigInt(balanceStr);
        } catch (e) {}
    }));
    process.stdout.write(`  Synced ${Math.min(i + BATCH, wallets.length)}/${wallets.length}\r`);
  }
  console.log("");
}

main().catch(e => { console.error(e); process.exit(1); });