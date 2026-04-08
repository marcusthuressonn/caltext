import { getRedis } from "./client.js";

const memoryKey = (phone: string) => `memory:${phone}`;

export async function saveMemory(phone: string, key: string, value: string): Promise<void> {
  const redis = getRedis();
  await redis.hset(memoryKey(phone), { [key]: value });
}

export async function recallAllMemories(phone: string): Promise<Record<string, string>> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(memoryKey(phone));
  return data ?? {};
}

export async function recallMemory(phone: string, key: string): Promise<string | null> {
  const redis = getRedis();
  return await redis.hget<string>(memoryKey(phone), key);
}

export async function deleteMemory(phone: string, key: string): Promise<void> {
  const redis = getRedis();
  await redis.hdel(memoryKey(phone), key);
}
