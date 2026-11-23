/* global process, console */
// Isolated stack for end-to-end tests and demos: an in-memory MongoDB, the seed data and the
// real backend on http://localhost:5000. Nothing touches your own database.
//   node frontend/e2e/start-stack.mjs
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..', '..', 'backend');
const require = createRequire(path.join(backendDir, 'package.json'));
const { MongoMemoryServer } = require('mongodb-memory-server');

const mongod = await MongoMemoryServer.create();
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: process.env.E2E_API_PORT ?? '5000',
  MONGODB_URI: mongod.getUri('repairhub-e2e'),
  CLIENT_URL: process.env.E2E_CLIENT_URL ?? 'http://localhost:5173',
  // Fresh random secrets on every run.
  JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('hex'),
};

const seed = spawnSync(process.execPath, ['src/seed/seed.js', '--reset'], {
  cwd: backendDir,
  env,
  encoding: 'utf8',
});
if (seed.status !== 0) {
  console.error('[e2e] seed failed', seed.stderr);
  await mongod.stop();
  process.exit(1);
}
console.log('[e2e] seed done');

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: backendDir,
  env,
  stdio: 'inherit',
});

let stopping = false;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  server.kill();
  await mongod.stop();
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
server.on('exit', (code) => stop(code ?? 0));
