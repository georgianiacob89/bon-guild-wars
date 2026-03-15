// ====================================================================
// GUILD WARS - CONFIGURATION
// ====================================================================

module.exports = {
  // --- NETWORK (BON Supernova) ---
  GATEWAY_URL: "https://gateway.battleofnodes.com",
  API_URL: "https://api.battleofnodes.com",
  CHAIN_ID: "B",

  // --- MASTER WALLET ---
  MASTER_PEM_PATH: "./master-wallet.pem",

  // --- WALLETS ---
  NUM_WALLETS: 500,
  WALLETS_DIR: "./wallets",
  WALLETS_INDEX_FILE: "./wallets-index.json",

  // --- TRANSACTIONS ---
  TX_VALUE: "1",            // 1 atomic unit (minimum)
  TX_GAS_LIMIT: 50000n,     // Network minimum
  TX_GAS_PRICE: 1000000000n,

  // --- DISTRIBUTION ---
  // Window A: 2000 EGLD / 500 = 4 EGLD each
  // Window B: 500 EGLD / 500 = 1 EGLD each
  EGLD_PER_WALLET_A: "4000000000000000000",  // 4 EGLD
  EGLD_PER_WALLET_B: "1000000000000000000",  // 1 EGLD

  // --- SPAM ---
  TXS_PER_BATCH: 100,
  BATCH_DELAY_MS: 6000,
  CONCURRENCY: 50,
  WINDOW_DURATION_MINUTES: 30,
};
