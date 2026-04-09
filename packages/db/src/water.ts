import type { WaterLog } from "@caltext/shared";
import { getRedis } from "./client";

const waterKey = (userId: string, localDate: string) => `water:${userId}:${localDate}`;

export async function logWater(userId: string, localDate: string, ml: number): Promise<void> {
  const redis = getRedis();
  await redis.hincrbyfloat(waterKey(userId, localDate), "totalMl", ml);
}

export async function getWaterLog(userId: string, localDate: string): Promise<WaterLog> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(waterKey(userId, localDate));
  const totalMl = parseFloat(data?.totalMl ?? "0");
  return {
    totalMl,
    glasses: Math.floor(totalMl / 250),
  };
}
