import { Redis } from '@upstash/redis';

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  });
}

const memory = new Map();

export async function wasSeen(digest) {
  if (redis) return Boolean(await redis.get(`moj:seen:${digest}`));
  return memory.has(digest);
}

export async function markSeen(digest) {
  if (redis) {
    await redis.set(`moj:seen:${digest}`, '1', { ex: 172800 });
    return;
  }
  memory.set(digest, Date.now());
  if (memory.size > 1000) {
    const oldest = [...memory.entries()].sort((a,b) => a[1] - b[1]).slice(0, 200);
    for (const [key] of oldest) memory.delete(key);
  }
}
