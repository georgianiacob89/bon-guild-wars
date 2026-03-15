// ====================================================================
// SCRIPT 3: TRANSACTION SPRINT — MAX SPEED RING
// ====================================================================
// Usage:
//   Default (1M cap):  node 3-spam-transactions.js
//   Custom cap:        node 3-spam-transactions.js --cap 5000000
//   ALL IN (no cap):   node 3-spam-transactions.js --cap 0
//   Member split:      node 3-spam-transactions.js --member 1 --cap 0
// ====================================================================

const { UserSigner } = require("@multiversx/sdk-wallet");
const { Transaction, TransactionComputer, Address, Account } = require("@multiversx/sdk-core");
const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");
const fs = require("fs");
const config = require("./config");

let totalSent = 0, totalFail = 0, startTime = null, isRunning = true;
const FEE = BigInt(config.TX_GAS_LIMIT) * BigInt(config.TX_GAS_PRICE);
const TOTAL_MEMBERS = 5;
const CONCURRENCY = 200;

// Parse --cap argument
const capArg = process.argv.indexOf("--cap");
const TX_CAP = capArg !== -1 ? parseInt(process.argv[capArg + 1]) : 1_010_000;
// 0 = no cap (all in)

async function main() {
  const memberArg = process.argv.indexOf("--member");
  const memberIdx = memberArg !== -1 ? parseInt(process.argv[memberArg + 1]) : 0;

  console.log("\n⚔️  MAX SPEED TRANSACTION SPRINT ⚔️\n");

  const allWallets = JSON.parse(fs.readFileSync(config.WALLETS_INDEX_FILE, "utf8"));

  // Build shard rings
  const shards = { 0: [], 1: [], 2: [] };
  allWallets.forEach(w => shards[w.shard].push(w));
  const walletRing = new Map();
  for (const s of [0, 1, 2]) {
    const list = shards[s];
    for (let i = 0; i < list.length; i++)
      walletRing.set(list[i].address, list[(i + 1) % list.length].address);
  }

  // Member split
  let myWallets;
  if (memberIdx >= 1 && memberIdx <= TOTAL_MEMBERS) {
    const per = Math.ceil(allWallets.length / TOTAL_MEMBERS);
    const start = (memberIdx - 1) * per;
    myWallets = allWallets.slice(start, Math.min(start + per, allWallets.length));
    console.log(`👤 Member ${memberIdx} — ${myWallets.length} wallets`);
  } else {
    myWallets = allWallets;
    console.log(`👤 ALL ${myWallets.length} wallets`);
  }

  console.log(`📡 ${config.GATEWAY_URL} | Chain: ${config.CHAIN_ID}`);
  console.log(`⚡ Concurrency: ${CONCURRENCY} | Batch: ${config.TXS_PER_BATCH}`);
  console.log(`🔄 Ring strategy | Zero delay`);
  console.log(`🎯 TX CAP: ${TX_CAP === 0 ? "UNLIMITED (ALL IN)" : TX_CAP.toLocaleString()}\n`);

  // Load signers
  console.log("🔑 Loading signers...");
  const loaded = myWallets.map(w => {
    const signer = UserSigner.fromPem(fs.readFileSync(w.pemFile, "utf8"));
    const bech32 = signer.getAddress().bech32();
    return { ...w, signer, bech32, coreAddress: Address.newFromBech32(bech32), receiver: walletRing.get(w.address) };
  });
  console.log(`✅ ${loaded.length} signers`);

  const provider = new ProxyNetworkProvider(config.GATEWAY_URL);

  // Fetch nonces & balances
  console.log("🔄 Fetching nonces...");
  const accounts = new Map();
  for (let i = 0; i < loaded.length; i += 100) {
    const batch = loaded.slice(i, i + 100);
    const results = await Promise.all(batch.map(async w => {
      try {
        const info = await provider.getAccount(w.coreAddress);
        return { b: w.bech32, nonce: BigInt(info.nonce.toString()), bal: BigInt(info.balance.toString()) };
      } catch { return { b: w.bech32, nonce: 0n, bal: 0n }; }
    }));
    results.forEach(r => accounts.set(r.b, r));
    process.stdout.write(`  ${Math.min(i + 100, loaded.length)}/${loaded.length}\r`);
  }
  console.log();

  const funded = loaded.filter(w => (accounts.get(w.bech32)?.bal || 0n) > FEE * 10n);
  console.log(`💰 Funded: ${funded.length}/${loaded.length}`);
  if (!funded.length) { console.error("❌ No funded wallets!"); process.exit(1); }

  // ============================================================
  // PRE-SIGN PHASE
  // ============================================================
  const effectiveCap = TX_CAP === 0 ? Infinity : TX_CAP;
  console.log(`\n🔐 Pre-signing transactions...\n`);

  const txc = new TransactionComputer();
  const walletBatches = new Map();

  const txPerWallet = TX_CAP === 0
    ? Infinity
    : Math.ceil(effectiveCap / funded.length);

  let totalPreSigned = 0;
  for (const w of funded) {
    if (totalPreSigned >= effectiveCap) break;

    const a = accounts.get(w.bech32);
    let nonce = a.nonce;
    let rem = a.bal;
    const batches = [];
    let walletCount = 0;

    while (rem > FEE * BigInt(config.TXS_PER_BATCH)) {
      if (walletCount >= txPerWallet) break;
      if (totalPreSigned + walletCount >= effectiveCap) break;

      const remaining = Math.min(
        effectiveCap - totalPreSigned - walletCount,
        txPerWallet - walletCount
      );
      const n = Math.min(config.TXS_PER_BATCH, Number(rem / FEE), remaining);
      if (n <= 0) break;

      const txs = [];
      for (let i = 0; i < n; i++) {
        const tx = new Transaction({
          nonce, value: BigInt(config.TX_VALUE),
          receiver: w.receiver, sender: w.bech32,
          gasLimit: config.TX_GAS_LIMIT, gasPrice: config.TX_GAS_PRICE,
          chainID: config.CHAIN_ID,
        });
        tx.signature = await w.signer.sign(txc.computeBytesForSigning(tx));
        txs.push(tx);
        nonce++;
      }
      batches.push(txs);
      rem -= FEE * BigInt(n);
      walletCount += n;
    }

    walletBatches.set(w.bech32, batches);
    totalPreSigned += walletCount;
    process.stdout.write(`  Pre-signed: ${totalPreSigned.toLocaleString()}${TX_CAP > 0 ? " / " + TX_CAP.toLocaleString() : ""}\r`);
  }

  const cost = (totalPreSigned * Number(FEE)) / 1e18;
  console.log(`\n\n✅ Pre-signed: ${totalPreSigned.toLocaleString()} transactions`);
  console.log(`💰 Fee cost: ${cost.toFixed(2)} EGLD`);
  console.log(`👛 Wallets used: ${[...walletBatches.values()].filter(b => b.length > 0).length}`);
  console.log(`⏱️  Estimated send time: ~${Math.ceil(totalPreSigned / 7000)}s at 7000 TPS`);

  // ============================================================
  // SEND PHASE
  // ============================================================
  console.log("\n⏳ Press ENTER to start sending...");
  await new Promise(r => process.stdin.once("data", () => r()));

  startTime = Date.now();
  console.log(`\n🚀🚀🚀 GO GO GO 🚀🚀🚀\n`);

  const tick = setInterval(stats, 3000);
  process.on("SIGINT", () => { isRunning = false; });
  setTimeout(() => { console.log("\n⏰ Time!"); isRunning = false; }, 31 * 60000);

  const sem = new Sem(CONCURRENCY);
  const activeFunded = funded.filter(w => walletBatches.has(w.bech32) && walletBatches.get(w.bech32).length > 0);
  await Promise.all(activeFunded.map(w => sem.acquire().then(async () => {
    try { await sender(w, walletBatches.get(w.bech32), provider); }
    finally { sem.release(); }
  })));

  clearInterval(tick);
  stats();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🏁 DONE in ${elapsed}s`);
  console.log(`📊 Sent: ${totalSent.toLocaleString()} | Failed: ${totalFail.toLocaleString()}`);
  console.log(`⚡ Average TPS: ${(totalSent / ((Date.now() - startTime) / 1000)).toFixed(0)}\n`);
  process.exit(0);
}

async function sender(wallet, batches, provider) {
  for (const batch of batches) {
    if (!isRunning || (TX_CAP > 0 && totalSent >= TX_CAP)) break;
    try {
      await provider.sendTransactions(batch);
      totalSent += batch.length;
    } catch {
      await sleep(200);
      if (!isRunning || (TX_CAP > 0 && totalSent >= TX_CAP)) break;
      try {
        await provider.sendTransactions(batch);
        totalSent += batch.length;
      } catch {
        totalFail += batch.length;
      }
    }
  }
}

function stats() {
  if (!startTime) return;
  const el = (Date.now() - startTime) / 1000;
  const capStr = TX_CAP > 0 ? ` / ${TX_CAP.toLocaleString()} (${((totalSent / TX_CAP) * 100).toFixed(1)}%)` : "";
  const mm = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  console.log(`[${mm(el)}] ✅ ${totalSent.toLocaleString()}${capStr} | ❌ ${totalFail.toLocaleString()} | ⚡ ${(totalSent / el).toFixed(0)} TPS`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class Sem {
  constructor(m) { this.m = m; this.c = 0; this.q = []; }
  acquire() { return new Promise(r => { if (this.c < this.m) { this.c++; r() } else this.q.push(r) }); }
  release() { this.c--; if (this.q.length) { this.c++; this.q.shift()() } }
}

main().catch(e => { console.error("❌", e); process.exit(1); });
