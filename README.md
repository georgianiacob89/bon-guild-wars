# HeroOrZero Guild — Battle of Nodes: Transaction Sprint

## Challenge 1 Results

- **Window A:** ~80K successful transactions (distribution issue limited us to 101/500 wallets)
- **Window B:** ~450K+ successful transactions (same 101 wallets, optimized scripts)
- **Strategy:** Intra-shard ring topology — each wallet sends to the next wallet in the same shard
- **Peak TPS:** ~500 TPS from 101 wallets
- **Fail rate:** <5%

## What We Built

All scripts built from scratch in JavaScript using the MultiversX SDK during the preparation window.

### Stack
- Node.js + `@multiversx/sdk-core` + `@multiversx/sdk-wallet` + `@multiversx/sdk-network-providers`
- Gateway: `gateway.battleofnodes.com`
- Chain ID: `B`

### Scripts

| Script | Purpose |
|--------|---------|
| `1-generate-wallets.js` | Generate 500 wallets with PEM files |
| `2-distribute-funds.js` | Distribute EGLD from GL wallet to 500 sending wallets |
| `3-spam-transactions.js` | Pre-sign + blast transactions (ring strategy) |
| `convert-json-to-pem.js` | Convert MultiversX keystore JSON to PEM format |
| `check-balances.js` | Verify wallet balances before challenge |
| `config.js` | Centralized configuration |

### Ring Strategy

Wallets are grouped by shard (0, 1, 2). Within each shard, they form a ring:

```
Shard 0: wallet_0 → wallet_1 → wallet_2 → ... → wallet_N → wallet_0
Shard 1: same pattern
Shard 2: same pattern
```

Benefits:
- All transactions are intra-shard (no cross-shard delay)
- EGLD circulates within the ring
- Each wallet is both sender and receiver

### Transaction Parameters
- Type: MoveBalance
- Value: 1 atomic unit (minimum)
- Gas limit: 50,000 (network minimum)
- Gas price: 1,000,000,000
- Fee per tx: 0.00005 EGLD

## Lessons Learned

1. **Test the full pipeline end-to-end** — Our biggest issue was that fund distribution only reached 101 out of 500 wallets. Always verify every wallet has received funds before starting.

2. **Pre-signing is powerful but slow** — Pre-signing millions of transactions takes minutes. For time-critical events, a hybrid approach (sign + send immediately) is more reliable.

3. **Mempool limits matter** — MultiversX allows max 100 nonces in advance per sender. Sending faster than the network processes creates nonce gaps and failed transactions.

4. **Cross-shard distribution takes time** — Funding wallets across different shards isn't instant. Budget extra time for cross-shard confirmations.

5. **Gateway throttling** — Under heavy load from all guilds simultaneously, the gateway rejects requests. A 300ms pause between batches significantly reduces failures.

6. **Start simple** — Our initial approach with pre-signed transactions and complex member splitting added unnecessary complexity. The direct sign-and-send approach was more reliable under pressure.

## Team

- **Guild Leader:** XOXNO x BOBER community
- **Members:** 2 active during the challenge
- **Built with:** Claude AI assistance for script development

## Network Details

- Explorer: https://bon-explorer.multiversx.com
- Gateway: https://gateway.battleofnodes.com
- API docs: https://api.battleofnodes.com/docs
- Chain ID: B (Battle of Nodes Supernova testnet)

