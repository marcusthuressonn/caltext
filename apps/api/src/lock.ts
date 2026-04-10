import { getRedis } from "@caltext/db";

const LOCK_TTL = 60;

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, "1", { nx: true, ex: LOCK_TTL });
  if (!acquired) return null;
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}
