/**
 * Creates missing indexes (including the 2dsphere indexes) and drops ones no longer declared.
 * Development syncs at boot; in production run this once per deploy:
 *   npm run db:indexes -w backend
 */
import { connectDB, disconnectDB, syncAllIndexes, ALL_MODELS } from '../config/db.js';

async function main() {
  await connectDB();
  await syncAllIndexes();
  for (const model of ALL_MODELS) {
    const names = (await model.collection.indexes()).map((i) => i.name);
    console.log(`[db:indexes] ${model.collection.collectionName}: ${names.join(', ')}`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[db:indexes] Failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
