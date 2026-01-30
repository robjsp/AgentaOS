import { createServer } from "./server";
import { initDatabase } from "./lib/database";
import { logger } from "./lib/logger";
import { config } from "./lib/config";

async function main() {
  logger.info("Starting AgentaOS...");

  // Initialize database
  await initDatabase();
  logger.info("Database initialized");

  // Create and start server
  const server = await createServer();

  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });
    logger.info(`AgentaOS running at http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
