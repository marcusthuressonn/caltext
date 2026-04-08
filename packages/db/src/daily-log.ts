import { getRedis } from "./client.js";
import { getMealsForDate } from "./meals.js";
import type { DailyLog } from "@caltext/shared";

const dailyKey = (phone: string, localDate: string) => `daily:${phone}:${localDate}`;

export async function updateDailyTotals(phone: string, localDate: string, addCalories: number, addProtein: number, addCarbs: number, addFat: number, addFiber: number): Promise<void> {
  const redis = getRedis();
  const key = dailyKey(phone, localDate);
  const pipeline = redis.pipeline();
  pipeline.hincrbyfloat(key, "calories", addCalories);
  pipeline.hincrbyfloat(key, "protein", addProtein);
  pipeline.hincrbyfloat(key, "carbs", addCarbs);
  pipeline.hincrbyfloat(key, "fat", addFat);
  pipeline.hincrbyfloat(key, "fiber", addFiber);
  pipeline.hincrby(key, "mealCount", 1);
  await pipeline.exec();
}

export async function getDailyLog(phone: string, localDate: string): Promise<DailyLog> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(dailyKey(phone, localDate));
  const meals = await getMealsForDate(phone, localDate);
  return {
    calories: parseFloat(data?.calories ?? "0"),
    protein: parseFloat(data?.protein ?? "0"),
    carbs: parseFloat(data?.carbs ?? "0"),
    fat: parseFloat(data?.fat ?? "0"),
    fiber: parseFloat(data?.fiber ?? "0"),
    mealCount: parseInt(data?.mealCount ?? "0", 10),
    meals,
  };
}

export async function getWeeklyLogs(phone: string, endDate: string, tz: string): Promise<{ date: string; log: DailyLog }[]> {
  const results: { date: string; log: DailyLog }[] = [];
  const end = new Date(endDate);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0]!;
    const log = await getDailyLog(phone, dateStr);
    results.push({ date: dateStr, log });
  }
  return results;
}
