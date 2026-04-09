import { getRedis } from "./client";

const memoryKey = (userId: string) => `memory:${userId}`;

export async function saveMemory(userId: string, key: string, value: string): Promise<void> {
  const redis = getRedis();
  await redis.hset(memoryKey(userId), { [key]: value });
}

export async function recallAllMemories(userId: string): Promise<Record<string, string>> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(memoryKey(userId));
  return data ?? {};
}

export async function recallMemory(userId: string, key: string): Promise<string | null> {
  const redis = getRedis();
  return await redis.hget<string>(memoryKey(userId), key);
}

export async function deleteMemory(userId: string, key: string): Promise<void> {
  const redis = getRedis();
  await redis.hdel(memoryKey(userId), key);
}
