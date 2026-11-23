import http from 'node:http';
import { env } from './config/env.js';
import { connectDB, disconnectDB, syncAllIndexes } from './config/db.js';
import app from './app.js';
import { closeSocket, initSocket } from './sockets/index.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start() {
  await connectDB();
  if (env.isDev) await syncAllIndexes();

  const server = http.createServer(app);
  initSocket(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.info(`[server] RepairHub API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);

  let shuttingDown = false;
  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[server] ${reason} received, shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error('[server] Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      // Closes Socket.io clients and, through Socket.io, stops the HTTP server accepting.
      await closeSocket();
      if (server.listening) {
        await new Promise((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
      }
      server.closeAllConnections?.();
      await disconnectDB();
      logger.info('[server] Shutdown complete');
      process.exit(exitCode);
    } catch (err) {
      logger.error('[server] Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.error('[server] Unhandled promise rejection', err);
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('[server] Uncaught exception', err);
    shutdown('uncaughtException', 1);
  });
}

start().catch((err) => {
  logger.error('[server] Failed to start', err);
  process.exit(1);
});
