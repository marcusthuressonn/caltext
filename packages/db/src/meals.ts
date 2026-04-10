import type { MealEntry } from "@caltext/shared";
import { getRedis } from "./client";

const mealKey = (id: string) => `meal:${id}`;
const mealsIndexKey = (userId: string, localDate: string) => `meals:${userId}:${localDate}`;
const TTL_90_DAYS = 60 * 60 * 24 * 90;

function safeParseArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return JSON.parse(val) as unknown[];
  return [];
}

export async function saveMeal(meal: MealEntry): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.hset(mealKey(meal.id), {
    userId: meal.userId,
    name: meal.name ?? "",
    items: JSON.stringify(meal.items),
    totalCalories: String(meal.totalCalories),
    totalProtein: String(meal.totalProtein),
    totalCarbs: String(meal.totalCarbs),
    totalFat: String(meal.totalFat),
    totalFiber: String(meal.totalFiber),
    photoUrl: meal.photoUrl ?? "",
    source: meal.source,
    timestamp: meal.timestamp,
    localDate: meal.localDate,
  });
  pipeline.zadd(mealsIndexKey(meal.userId, meal.localDate), {
    score: new Date(meal.timestamp).getTime(),
    member: meal.id,
  });
  pipeline.expire(mealKey(meal.id), TTL_90_DAYS);
  pipeline.expire(mealsIndexKey(meal.userId, meal.localDate), TTL_90_DAYS);
  await pipeline.exec();
}

function parseMeal(id: string, data: Record<string, unknown>, fallbackUserId?: string, fallbackDate?: string): MealEntry {
  return {
    id,
    userId: String(data.userId ?? fallbackUserId ?? ""),
    name: data.name ? String(data.name) : undefined,
    items: safeParseArray(data.items) as MealEntry["items"],
    totalCalories: Number(data.totalCalories ?? 0),
    totalProtein: Number(data.totalProtein ?? 0),
    totalCarbs: Number(data.totalCarbs ?? 0),
    totalFat: Number(data.totalFat ?? 0),
    totalFiber: Number(data.totalFiber ?? 0),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    source: (String(data.source ?? "text") as MealEntry["source"]),
    timestamp: String(data.timestamp ?? new Date().toISOString()),
    localDate: String(data.localDate ?? fallbackDate ?? ""),
  };
}

export async function getMeal(mealId: string): Promise<MealEntry | null> {
  const redis = getRedis();
  const data = await redis.hgetall(mealKey(mealId));
  if (!data || Object.keys(data).length === 0) return null;
  return parseMeal(mealId, data as Record<string, unknown>);
}

export async function deleteMeal(mealId: string, userId: string, localDate: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(mealKey(mealId));
  pipeline.zrem(mealsIndexKey(userId, localDate), mealId);
  await pipeline.exec();
}

export async function deleteAllMealsForDate(userId: string, localDate: string): Promise<string[]> {
  const redis = getRedis();
  const mealIds = await redis.zrange<string[]>(mealsIndexKey(userId, localDate), 0, -1);
  if (!mealIds || mealIds.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of mealIds) {
    pipeline.del(mealKey(id));
  }
  pipeline.del(mealsIndexKey(userId, localDate));
  await pipeline.exec();
  return mealIds;
}

export async function getMealsForDate(userId: string, localDate: string): Promise<MealEntry[]> {
  const redis = getRedis();
  const mealIds = await redis.zrange<string[]>(mealsIndexKey(userId, localDate), 0, -1);
  if (!mealIds || mealIds.length === 0) return [];

  const results = await Promise.all(
    mealIds.map((id) => redis.hgetall(mealKey(id))),
  );

  const meals: MealEntry[] = [];
  for (let i = 0; i < mealIds.length; i++) {
    const data = results[i];
    if (!data || Object.keys(data).length === 0) continue;
    meals.push(parseMeal(mealIds[i]!, data as Record<string, unknown>, userId, localDate));
  }
  return meals;
}
