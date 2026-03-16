const { Address } = require("@multiversx/sdk-core");

// Test typical shard calculation
// MultiversX typically uses the last bits.
// For 3 shards, it usually looks at specific bits.

console.log("Testing Shard Calculation...");

// Create a dummy address or use one if known.
// We'll generate random addresses and compare `lastByte % 3` vs `address.getShard()`

const mismatchCount = 0;
const total = 1000;

for(let i=0; i<total; i++) {
    // Random 32 bytes
    const buffer = Buffer.alloc(32);
    for(let b=0; b<32; b++) buffer[b] = Math.floor(Math.random() * 256);
    
    const addr = new Address(buffer);
    const sdkShard = addr.getShard();

    const lastByte = buffer[31]; // last byte
    const manualShard = lastByte % 3; // The logic in 1-generate-wallets.js

    if (sdkShard !== manualShard) {
        console.log(`Mismatch! Addr: ${addr.bech32()}`);
        console.log(`  SDK Shard: ${sdkShard}`);
        console.log(`  Manual calc (lastByte % 3): ${manualShard}`);
        console.log(`  Last Byte: ${lastByte}`);
        process.exit(1); 
    }
}

console.log("All matched!");
