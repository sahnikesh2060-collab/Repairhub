import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Must be set before anything imports src/config/env.js, hence the dynamic import below.
// These are throwaway values for the in-memory test database only.
const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '5099',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/repairhub-test-placeholder',
  CLIENT_URL: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-fedcba9876543210fedcba9876543210',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  COOKIE_SECURE: 'false',
  MAX_DISPATCH_RADIUS_KM: '25',
  DEFAULT_SERVICE_RADIUS_KM: '10',
  MAX_PROPOSAL_ROUNDS: '3',
  UPLOAD_MAX_FILES: '5',
  UPLOAD_MAX_MB: '5',
  CURRENCY: 'NPR',
  SEED_CENTER_LAT: '27.7172',
  SEED_CENTER_LNG: '85.3240',
};
Object.assign(process.env, TEST_ENV);

const { syncAllIndexes } = await import('../src/config/db.js');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'repairhub-test' });
  await syncAllIndexes();
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
