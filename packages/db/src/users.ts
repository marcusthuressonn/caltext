import type { UserProfile } from "@caltext/shared";
import { getRedis } from "./client";

const userKey = (userId: string) => `user:${userId}`;
const phoneIndexKey = (encryptedPhone: string) => `phone:${encryptedPhone}`;

export async function resolveUserId(encryptedPhone: string): Promise<string | null> {
  const redis = getRedis();
  return await redis.get<string>(phoneIndexKey(encryptedPhone));
}

export async function createPhoneMapping(encryptedPhone: string, userId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(phoneIndexKey(encryptedPhone), userId);
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(userKey(userId));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    id: userId,
    phone: data.phone ?? "",
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
    consentedAt: data.consentedAt || null,
    consentVersion: data.consentVersion || null,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export async function createUser(
  userId: string,
  encryptedPhone: string,
  profile: Omit<UserProfile, "id" | "phone" | "createdAt">,
): Promise<void> {
  const redis = getRedis();
  await redis.hset(userKey(userId), {
    phone: encryptedPhone,
    ...profile,
    onboardingComplete: String(profile.onboardingComplete),
    dailyCalorieTarget: String(profile.dailyCalorieTarget),
    age: String(profile.age),
    heightCm: String(profile.heightCm),
    weightKg: String(profile.weightKg),
    consentedAt: profile.consentedAt ?? "",
    consentVersion: profile.consentVersion ?? "",
    createdAt: new Date().toISOString(),
  });
}

export async function updateUser(
  userId: string,
  fields: Partial<Record<string, string>>,
): Promise<void> {
  const redis = getRedis();
  await redis.hset(userKey(userId), fields);
}

export async function userExists(userId: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(userKey(userId))) === 1;
}

export async function withdrawConsent(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.hset(userKey(userId), { consentedAt: "", consentVersion: "" });
}

export async function deleteAllUserData(userId: string): Promise<void> {
  const redis = getRedis();

  const user = await getUser(userId);
  const keysToDelete: string[] = [
    userKey(userId),
    `streak:${userId}`,
    `memory:${userId}`,
    `messages:${userId}`,
    `weight:${userId}`,
    `favorites:${userId}`,
    `reminder:${userId}`,
    `reminder_times:${userId}`,
    `onboarding:${userId}`,
    `export:${userId}`,
  ];

  if (user?.phone) {
    keysToDelete.push(phoneIndexKey(user.phone));
  }

  const wildcardPatterns = [`meals:${userId}:*`, `daily:${userId}:*`, `water:${userId}:*`];

  for (const pattern of wildcardPatterns) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = (await redis.scan(Number(cursor), {
        match: pattern,
        count: 100,
      })) as unknown as [string, string[]];
      cursor = nextCursor;
      for (const key of keys) {
        if (key.startsWith("meals:")) {
          const mealIds = await redis.zrange<string[]>(key, 0, -1);
          for (const mealId of mealIds) {
            keysToDelete.push(`meal:${mealId}`);
          }
        }
        keysToDelete.push(key);
      }
    } while (cursor !== "0");
  }

  if (keysToDelete.length > 0) {
    const pipeline = redis.pipeline();
    for (const key of keysToDelete) {
      pipeline.del(key);
    }
    await pipeline.exec();
  }
}
