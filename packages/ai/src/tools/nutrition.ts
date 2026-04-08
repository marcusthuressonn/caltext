import { tool } from "ai";
import { z } from "zod";
import type { NutritionInfo } from "@caltext/shared";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

const NUTRIENT_IDS = {
  energy: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
};

function extractNutrients(foodNutrients: Array<{ nutrientId: number; value: number }>): Record<string, number> {
  const result: Record<string, number> = { energy: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  for (const fn of foodNutrients) {
    for (const [name, id] of Object.entries(NUTRIENT_IDS)) {
      if (fn.nutrientId === id) {
        result[name] = fn.value;
      }
    }
  }
  return result;
}

export const lookupNutrition = tool({
  description: "Look up nutrition data for a food item using the USDA FoodData Central database. Returns calories, protein, carbs, fat, and fiber per the specified gram amount.",
  inputSchema: z.object({
    foodName: z.string().describe("Food name to search, e.g. 'grilled chicken breast'"),
    grams: z.number().describe("Amount in grams to calculate nutrition for"),
    preparationMethod: z.string().optional().describe("How the food is prepared, to refine the search"),
  }),
  execute: async ({ foodName, grams, preparationMethod }): Promise<NutritionInfo> => {
    const apiKey = process.env.USDA_API_KEY;
    const query = preparationMethod ? `${foodName}, ${preparationMethod}` : foodName;

    try {
      const response = await fetch(
        `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&dataType=Survey%20(FNDDS)&pageSize=3&api_key=${apiKey}`
      );
      const data = await response.json() as { foods: Array<{ fdcId: number; description: string; foodNutrients: Array<{ nutrientId: number; value: number }> }> };

      if (!data.foods || data.foods.length === 0) {
        return {
          matchedName: foodName,
          calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
        };
      }

      const best = data.foods[0]!;
      const nutrients = extractNutrients(best.foodNutrients);
      const scale = grams / 100;

      return {
        fdcId: best.fdcId,
        matchedName: best.description,
        calories: Math.round(nutrients.energy! * scale),
        protein: Math.round(nutrients.protein! * scale * 10) / 10,
        carbs: Math.round(nutrients.carbs! * scale * 10) / 10,
        fat: Math.round(nutrients.fat! * scale * 10) / 10,
        fiber: Math.round(nutrients.fiber! * scale * 10) / 10,
      };
    } catch {
      return {
        matchedName: foodName,
        calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
      };
    }
  },
});
