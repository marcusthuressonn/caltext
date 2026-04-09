import type { DailyLog } from "@caltext/shared";
import { format, parseISO, subDays } from "date-fns";
import { getRedis } from "./client";
import { getMealsForDate } from "./meals";

const dailyKey = (userId: string, localDate: string) => `daily:${userId}:${localDate}`;

export async function updateDailyTotals(
  userId: string,
  localDate: string,
  addCalories: number,
  addProtein: number,
  addCarbs: number,
  addFat: number,
  addFiber: number,
): Promise<void> {
  const redis = getRedis();
  const key = dailyKey(userId, localDate);
  const pipeline = redis.pipeline();
  pipeline.hincrbyfloat(key, "calories", addCalories);
  pipeline.hincrbyfloat(key, "protein", addProtein);
  pipeline.hincrbyfloat(key, "carbs", addCarbs);
  pipeline.hincrbyfloat(key, "fat", addFat);
  pipeline.hincrbyfloat(key, "fiber", addFiber);
  pipeline.hincrby(key, "mealCount", 1);
  await pipeline.exec();
}

export async function subtractDailyTotals(
  userId: string,
  localDate: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
): Promise<void> {
  const redis = getRedis();
  const key = dailyKey(userId, localDate);
  const pipeline = redis.pipeline();
  pipeline.hincrbyfloat(key, "calories", -calories);
  pipeline.hincrbyfloat(key, "protein", -protein);
  pipeline.hincrbyfloat(key, "carbs", -carbs);
  pipeline.hincrbyfloat(key, "fat", -fat);
  pipeline.hincrbyfloat(key, "fiber", -fiber);
  pipeline.hincrby(key, "mealCount", -1);
  await pipeline.exec();
}

export async function deleteDailyLog(userId: string, localDate: string): Promise<void> {
  const redis = getRedis();
  await redis.del(dailyKey(userId, localDate));
}

export async function getDailyLog(userId: string, localDate: string): Promise<DailyLog> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(dailyKey(userId, localDate));
  const meals = await getMealsForDate(userId, localDate);
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

export async function getWeeklyLogs(
  userId: string,
  endDate: string,
  _tz: string,
): Promise<{ date: string; log: DailyLog }[]> {
  const results: { date: string; log: DailyLog }[] = [];
  const end = parseISO(endDate);
  for (let i = 6; i >= 0; i--) {
    const dateStr = format(subDays(end, i), "yyyy-MM-dd");
    const log = await getDailyLog(userId, dateStr);
    results.push({ date: dateStr, log });
  }
  return results;
}
