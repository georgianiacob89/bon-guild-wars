const { fork } = require("child_process");
const path = require("path");

// Настройки
const SCRIPT_NAME = "3-spam-transactions-supernova.js";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_NAME);
const SHARDS = [0, 1, 2]; // Какие шарды запускать

console.log(`
===================================================
   🚀 MULTI-SHARD LAUNCHER FOR BON GUILD WARS 🚀   
===================================================
Script: ${SCRIPT_NAME}
Shards: ${SHARDS.join(", ")}
===================================================
`);

const children = [];

SHARDS.forEach((shardId) => {
  // Параметры запуска: node script.js --shard X --cap 0
  const args = ["--shard", String(shardId), "--cap", "0"];

  console.log(`[Launcher] Spawning Worker for Shard ${shardId}...`);

  // fork запускает скрипт в отдельном процессе (используя отдельное ядро CPU)
  const child = fork(SCRIPT_PATH, args, {
    stdio: "inherit", // Вывод логов прямо в эту консоль
  });

  children.push({ shard: shardId, process: child });

  child.on("exit", (code) => {
    console.log(`[Launcher] ⚠️ Worker Shard ${shardId} exited with code ${code}`);
  });
});

console.log(`\n✅ All ${children.length} workers started!\nPress Ctrl+C to stop everything.\n`);

// Обработка нажатия Ctrl+C для корректной остановки всех процессов
process.on("SIGINT", () => {
  console.log("\n\n🛑 STOPPING ALL WORKERS...");
  children.forEach((w) => {
    console.log(`   Killing Shard ${w.shard}...`);
    w.process.kill("SIGINT");
  });
  process.exit();
});
