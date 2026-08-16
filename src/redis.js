import IORedis from 'ioredis';
import { config } from './config.js';

// BullMQ requires maxRetriesPerRequest: null on its connections, and it's
// cleaner to give the Queue and the Worker their own connection each.
export function makeConnection() {
  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  connection.on('error', () => {});
  return connection;
}

// A plain connection for the result cache (get/set/expire).
export const cacheRedis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});
cacheRedis.on('error', () => {});
