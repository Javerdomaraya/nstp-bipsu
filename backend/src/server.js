import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}

import { createApp } from './app.js';
import { env, validateEnv } from './config/env.js';
import prisma from './db/prisma.js';
import { logger } from './utils/logger.js';
import { setupWebSocket } from './websocket.js';

validateEnv();

const app = createApp();

const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info(`NSTP backend listening on http://0.0.0.0:${env.port}`);
});

setupWebSocket(server);

async function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down backend.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error({ message: err.message, stack: err.stack }, 'UNCAUGHT_EXCEPTION');
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'UNHANDLED_REJECTION');
  shutdown('UNHANDLED_REJECTION');
});
