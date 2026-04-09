import type { WeightEntry } from "@caltext/shared";
import { getRedis } from "./client";

const weightKey = (userId: string) => `weight:${userId}`;

export async function logWeight(userId: string, weightKg: number, date: string): Promise<void> {
  const redis = getRedis();
  const member = `${weightKg}:${date}`;
  await redis.zadd(weightKey(userId), { score: new Date(date).getTime(), member });
}

export async function getWeightHistory(userId: string, limit = 30): Promise<WeightEntry[]> {
  const redis = getRedis();
  const raw = await redis.zrange<string[]>(weightKey(userId), 0, -1, { rev: true });
  if (!raw || raw.length === 0) return [];

  return raw.slice(0, limit).map((entry) => {
    const [kg, date] = entry.split(":");
    return { weightKg: parseFloat(kg!), date: date! };
  });
}

export async function deleteAllWeightData(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(weightKey(userId));
}
