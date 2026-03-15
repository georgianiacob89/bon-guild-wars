// ====================================================================
// HELPER: CHECK BALANCES
// ====================================================================
// Usage: node check-balances.js
// ====================================================================

const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");
const { Address } = require("@multiversx/sdk-core");
const fs = require("fs");
const config = require("./config");

async function checkBalances() {
  console.log("\n📊 BALANCE CHECKER\n");

  const provider = new ProxyNetworkProvider(config.GATEWAY_URL);
  const walletIndex = JSON.parse(
    fs.readFileSync(config.WALLETS_INDEX_FILE, "utf8")
  );

  let funded = 0;
  let empty = 0;
  let totalBalance = 0n;

  for (let i = 0; i < walletIndex.length; i += 50) {
    const batch = walletIndex.slice(i, i + 50);
    const results = await Promise.all(
      batch.map(async (w) => {
        try {
          const acc = await provider.getAccount(
            Address.newFromBech32(w.address)
          );
          return BigInt(acc.balance.toString());
        } catch {
          return 0n;
        }
      })
    );
    for (const bal of results) {
      totalBalance += bal;
      if (bal > 0n) funded++;
      else empty++;
    }
    process.stdout.write(
      `  Checked ${Math.min(i + 50, walletIndex.length)}/${walletIndex.length}\r`
    );
  }

  const total = walletIndex.length;
  console.log(`\n`);
  console.log(`✅ Funded:  ${funded}/${total}`);
  console.log(`❌ Empty:   ${empty}/${total}`);
  console.log(`💰 Total:   ${(Number(totalBalance) / 1e18).toFixed(4)} EGLD`);
  console.log(
    `💰 Average: ${(Number(totalBalance) / 1e18 / total).toFixed(4)} EGLD\n`
  );
}

checkBalances().catch(console.error);
