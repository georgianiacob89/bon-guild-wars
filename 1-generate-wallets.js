// ====================================================================
// SCRIPT 1: GENERATE 500 WALLETS
// ====================================================================
// Usage: node 1-generate-wallets.js
//
// Creates 500 fresh wallets as PEM files + an index JSON.
// Run ONCE during preparation phase.
// ====================================================================

const { Mnemonic, UserSigner } = require("@multiversx/sdk-wallet");
const fs = require("fs");
const path = require("path");
const config = require("./config");

async function generateWallets() {
  const walletsDir = config.WALLETS_DIR;

  if (!fs.existsSync(walletsDir)) {
    fs.mkdirSync(walletsDir, { recursive: true });
  }

  const walletIndex = [];

  console.log(`\n🔑 Generating ${config.NUM_WALLETS} wallets...\n`);

  for (let i = 0; i < config.NUM_WALLETS; i++) {
    const mnemonic = Mnemonic.generate();
    const secretKey = mnemonic.deriveKey(0);
    const publicKey = secretKey.generatePublicKey();
    const address = publicKey.toAddress(); // UserAddress
    const addrBech32 = address.bech32();

    // ---- Build PEM ----
    // MultiversX PEM format: base64( hex( seed_32_bytes + pubkey_32_bytes ) )
    const skBytes = secretKey.valueOf();
    const pkBytes = publicKey.valueOf();
    const combinedHex =
      Buffer.from(skBytes).toString("hex") +
      Buffer.from(pkBytes).toString("hex");
    const b64 = Buffer.from(combinedHex).toString("base64");
    const b64Lines = b64.match(/.{1,64}/g).join("\n");
    const pemContent =
      `-----BEGIN PRIVATE KEY for ${addrBech32}-----\n` +
      b64Lines +
      `\n-----END PRIVATE KEY for ${addrBech32}-----`;

    const pemFilePath = path.join(
      walletsDir,
      `wallet_${String(i).padStart(4, "0")}.pem`
    );
    fs.writeFileSync(pemFilePath, pemContent);

    // Save mnemonic (backup)
    const mnemonicPath = path.join(
      walletsDir,
      `wallet_${String(i).padStart(4, "0")}.mnemonic`
    );
    fs.writeFileSync(mnemonicPath, mnemonic.toString());

    // Verify PEM round-trip on first wallet
    if (i === 0) {
      const testSigner = UserSigner.fromPem(pemContent);
      if (testSigner.getAddress().bech32() !== addrBech32) {
        throw new Error("PEM round-trip failed! Aborting.");
      }
      console.log("  ✅ PEM round-trip verified on first wallet");
    }

    // Determine shard (last byte of pubkey mod 3)
    const lastByte = pkBytes[pkBytes.length - 1];
    const shard = lastByte % 3;

    walletIndex.push({
      index: i,
      address: addrBech32,
      shard,
      pemFile: pemFilePath,
    });

    if ((i + 1) % 50 === 0 || i === config.NUM_WALLETS - 1) {
      console.log(`  ✅ Generated ${i + 1}/${config.NUM_WALLETS} wallets`);
    }
  }

  // Save index
  fs.writeFileSync(
    config.WALLETS_INDEX_FILE,
    JSON.stringify(walletIndex, null, 2)
  );

  // Shard stats
  const shardCounts = { 0: 0, 1: 0, 2: 0 };
  walletIndex.forEach((w) => shardCounts[w.shard]++);

  console.log(`\n📊 Shard Distribution:`);
  console.log(`  Shard 0: ${shardCounts[0]} wallets`);
  console.log(`  Shard 1: ${shardCounts[1]} wallets`);
  console.log(`  Shard 2: ${shardCounts[2]} wallets`);
  console.log(`\n💾 Index  → ${config.WALLETS_INDEX_FILE}`);
  console.log(`📁 PEM    → ${walletsDir}/`);
  console.log(`\n⚠️  KEEP THESE FILES SAFE — they hold private keys.\n`);
}

generateWallets().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
