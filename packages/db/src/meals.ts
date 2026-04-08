import { getRedis } from "./client.js";
import type { MealEntry } from "@caltext/shared";

const mealKey = (id: string) => `meal:${id}`;
const mealsIndexKey = (phone: string, localDate: string) => `meals:${phone}:${localDate}`;

export async function saveMeal(meal: MealEntry): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.hset(mealKey(meal.id), {
    phone: meal.phone,
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
  pipeline.zadd(mealsIndexKey(meal.phone, meal.localDate), {
    score: new Date(meal.timestamp).getTime(),
    member: meal.id,
  });
  await pipeline.exec();
}

export async function getMealsForDate(phone: string, localDate: string): Promise<MealEntry[]> {
  const redis = getRedis();
  const mealIds = await redis.zrange<string[]>(mealsIndexKey(phone, localDate), 0, -1);
  if (!mealIds || mealIds.length === 0) return [];

  const meals: MealEntry[] = [];
  for (const id of mealIds) {
    const data = await redis.hgetall<Record<string, string>>(mealKey(id));
    if (!data || Object.keys(data).length === 0) continue;
    meals.push({
      id,
      phone: data.phone ?? phone,
      items: JSON.parse(data.items ?? "[]"),
      totalCalories: parseInt(data.totalCalories ?? "0", 10),
      totalProtein: parseFloat(data.totalProtein ?? "0"),
      totalCarbs: parseFloat(data.totalCarbs ?? "0"),
      totalFat: parseFloat(data.totalFat ?? "0"),
      totalFiber: parseFloat(data.totalFiber ?? "0"),
      photoUrl: data.photoUrl || undefined,
      source: (data.source as MealEntry["source"]) ?? "text",
      timestamp: data.timestamp ?? new Date().toISOString(),
      localDate: data.localDate ?? localDate,
    });
  }
  return meals;
}
