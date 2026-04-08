import { getRedis } from "./client.js";
import type { UserProfile } from "@caltext/shared";

const userKey = (phone: string) => `user:${phone}`;

export async function getUser(phone: string): Promise<UserProfile | null> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(userKey(phone));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    phone,
    name: data.name ?? "",
    locale: data.locale ?? "en",
    timezone: data.timezone ?? "UTC",
    country: data.country ?? "US",
    dailyCalorieTarget: parseInt(data.dailyCalorieTarget ?? "2000", 10),
    goal: (data.goal as UserProfile["goal"]) ?? "maintain",
    activity: (data.activity as UserProfile["activity"]) ?? "moderate",
    sex: (data.sex as UserProfile["sex"]) ?? "male",
    age: parseInt(data.age ?? "30", 10),
    heightCm: parseFloat(data.heightCm ?? "170"),
    weightKg: parseFloat(data.weightKg ?? "70"),
    onboardingComplete: data.onboardingComplete === "true",
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export async function createUser(phone: string, profile: Omit<UserProfile, "phone" | "createdAt">): Promise<void> {
  const redis = getRedis();
  await redis.hset(userKey(phone), {
    ...profile,
    onboardingComplete: String(profile.onboardingComplete),
    dailyCalorieTarget: String(profile.dailyCalorieTarget),
    age: String(profile.age),
    heightCm: String(profile.heightCm),
    weightKg: String(profile.weightKg),
    createdAt: new Date().toISOString(),
  });
}

export async function updateUser(phone: string, fields: Partial<Record<string, string>>): Promise<void> {
  const redis = getRedis();
  await redis.hset(userKey(phone), fields);
}

export async function userExists(phone: string): Promise<boolean> {
  const redis = getRedis();
  return await redis.exists(userKey(phone)) === 1;
}
