import { saveMeal, updateDailyTotals } from "@caltext/db";
import { localDateString } from "@caltext/shared";
import { tool } from "ai";
import { z } from "zod";

export const logMeal = tool({
  description:
    "Log a meal entry with nutrition data to the user's daily log. Call this after identifying food and looking up nutrition.",
  inputSchema: z.object({
    userId: z.string(),
    timezone: z.string(),
    mealName: z.string().describe("Short descriptive name for the meal, e.g. 'Greek plate', 'Morning oatmeal', 'Chicken salad lunch'"),
    items: z.array(
      z.object({
        name: z.string(),
        estimatedGrams: z.number(),
        preparationMethod: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
        notes: z.string().optional(),
        nutrition: z.object({
          matchedName: z.string(),
          calories: z.number(),
          protein: z.number(),
          carbs: z.number(),
          fat: z.number(),
          fiber: z.number(),
        }),
      }),
    ),
    photoUrl: z.string().optional(),
    source: z.enum(["photo", "text", "manual"]),
  }),
  execute: async ({ userId, timezone, mealName, items, photoUrl, source }) => {
    const localDate = localDateString(timezone);
    const id = `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const totalCalories = items.reduce((sum, i) => sum + i.nutrition.calories, 0);
    const totalProtein = items.reduce((sum, i) => sum + i.nutrition.protein, 0);
    const totalCarbs = items.reduce((sum, i) => sum + i.nutrition.carbs, 0);
    const totalFat = items.reduce((sum, i) => sum + i.nutrition.fat, 0);
    const totalFiber = items.reduce((sum, i) => sum + i.nutrition.fiber, 0);

    await saveMeal({
      id,
      userId,
      name: mealName,
      items,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
      photoUrl,
      source,
      timestamp: new Date().toISOString(),
      localDate,
    });

    await updateDailyTotals(
      userId,
      localDate,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
    );

    return {
      mealId: id,
      totalCalories,
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
      totalFiber: Math.round(totalFiber * 10) / 10,
      localDate,
    };
  },
});
