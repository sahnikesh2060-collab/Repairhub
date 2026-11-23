import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/User.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { Booking } from '../models/Booking.js';
import { Category } from '../models/Category.js';
import { Counter } from '../models/Counter.js';
import { Notification } from '../models/Notification.js';
import { Message } from '../models/Message.js';

export const ALL_MODELS = Object.freeze([
  User,
  TechnicianProfile,
  Booking,
  Category,
  Counter,
  Notification,
  Message,
]);

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mongoose.set('strictQuery', true);

let listenersAttached = false;
function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('disconnected', () => logger.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('[db] MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error('[db] MongoDB error', err.message));
}

/**
 * Connects to MongoDB, retrying up to 5 times with exponential backoff (1s, 2s, 4s, 8s).
 * @param {string} [uri]
 */
export async function connectDB(uri = env.MONGODB_URI) {
  attachConnectionListeners();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // In production indexes are built by `npm run db:indexes`, not at every boot.
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: !env.isProd });
      logger.info(
        `[db] Connected to MongoDB (${mongoose.connection.host}/${mongoose.connection.name})`,
      );
      return mongoose.connection;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        logger.error(`[db] Could not connect after ${MAX_ATTEMPTS} attempts`);
        throw err;
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        `[db] Connection attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}

/** Creates missing indexes and drops ones no longer declared in the schemas. */
export async function syncAllIndexes() {
  for (const model of ALL_MODELS) {
    await model.syncIndexes();
  }
  logger.debug(`[db] Indexes synced for ${ALL_MODELS.length} models`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('[db] MongoDB connection closed');
}

/** True while the default connection is open. */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
