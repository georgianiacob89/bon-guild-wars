const { UserWallet, UserSigner } = require("@multiversx/sdk-wallet");
const fs = require("fs");

async function convert() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('\n⚠️  Usage: node convert-json-to-pem.js <keystore.json> <password>');
    console.log('   Example: node convert-json-to-pem.js myWallet.json "MyPass123"\n');
    process.exit(1);
  }

  const keystorePath = args[0];
  const password = args[1];
  const outputPath = args[2] || "master-wallet.pem";

  console.log(`\n🔑 Converting ${keystorePath} → ${outputPath}\n`);

  const keystoreJson = JSON.parse(fs.readFileSync(keystorePath, "utf8"));

  let secretKey;
  try {
    // Try as mnemonic keystore first (kind: "mnemonic")
    const mnemonic = UserWallet.decryptMnemonic(keystoreJson, password);
    secretKey = mnemonic.deriveKey(0);
    console.log("  📋 Keystore type: mnemonic");
  } catch (err1) {
    try {
      // Fallback: try as secretKey keystore
      secretKey = UserWallet.decryptSecretKey(keystoreJson, password);
      console.log("  📋 Keystore type: secretKey");
    } catch (err2) {
      console.error("❌ Wrong password or invalid keystore.");
      console.error("   Error:", err2.message);
      process.exit(1);
    }
  }

  const publicKey = secretKey.generatePublicKey();
  const address = publicKey.toAddress().bech32();

  // MultiversX PEM: base64( hex( seed + pubkey ) )
  const hex = Buffer.from(secretKey.valueOf()).toString("hex") +
              Buffer.from(publicKey.valueOf()).toString("hex");
  const b64 = Buffer.from(hex).toString("base64");
  const lines = b64.match(/.{1,64}/g).join("\n");
  const pem = `-----BEGIN PRIVATE KEY for ${address}-----\n${lines}\n-----END PRIVATE KEY for ${address}-----`;

  // Verify
  const signer = UserSigner.fromPem(pem);
  if (signer.getAddress().bech32() !== address) {
    console.error("❌ PEM verification failed!");
    process.exit(1);
  }

  fs.writeFileSync(outputPath, pem);
  console.log(`✅ Address: ${address}`);
  console.log(`✅ PEM saved: ${outputPath}\n`);
}

convert().catch(e => { console.error("❌", e.message); process.exit(1); });
