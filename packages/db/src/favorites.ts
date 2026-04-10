import type { MealItem } from "@caltext/shared";
import { getRedis } from "./client";

const favoritesKey = (userId: string) => `favorites:${userId}`;

export async function saveFavorite(userId: string, name: string, items: MealItem[]): Promise<void> {
  const redis = getRedis();
  await redis.hset(favoritesKey(userId), { [name.toLowerCase()]: JSON.stringify(items) });
}

export async function getFavorite(userId: string, name: string): Promise<MealItem[] | null> {
  const redis = getRedis();
  const raw = await redis.hget(favoritesKey(userId), name.toLowerCase());
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as MealItem[];
  if (typeof raw === "string") return JSON.parse(raw) as MealItem[];
  return null;
}

export async function getAllFavorites(userId: string): Promise<string[]> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(favoritesKey(userId));
  if (!data) return [];
  return Object.keys(data);
}

export async function deleteFavorite(userId: string, name: string): Promise<void> {
  const redis = getRedis();
  await redis.hdel(favoritesKey(userId), name.toLowerCase());
}

export async function deleteAllFavorites(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(favoritesKey(userId));
}
