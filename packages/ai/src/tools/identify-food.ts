import { openai } from "@ai-sdk/openai";
import { generateObject, tool } from "ai";
import { z } from "zod";

export const nutritionLabelSchema = z.object({
  productName: z.string().describe("Product name as shown on packaging"),
  servingSize: z.string().describe("Serving size as printed, e.g. '1 bottle (500ml)' or '100g'"),
  servingGrams: z.number().describe("Serving size converted to grams"),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
});

export const foodIdentificationSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("Common food name, e.g. 'grilled chicken breast'"),
      estimatedGrams: z.number().describe("Estimated weight in grams based on visual cues"),
      preparationMethod: z
        .string()
        .describe("How it appears prepared: raw, grilled, fried, boiled, etc."),
      confidence: z.enum(["high", "medium", "low"]),
      notes: z.string().optional().describe("Anything uncertain, e.g. 'could be diet or regular'"),
    }),
  ),
  sceneContext: z
    .string()
    .optional()
    .describe("Visible reference objects: plate size, utensils, hands"),
  nutritionLabel: nutritionLabelSchema
    .optional()
    .describe(
      "Present only when a nutrition facts label is visible on a packaged product. Do NOT populate items when this is set.",
    ),
});

export type FoodIdentification = z.infer<typeof foodIdentificationSchema>;

export const FOOD_IDENTIFICATION_PROMPT = `Analyze this food photo. There are two modes depending on what you see:

MODE 1 — PLATE OF FOOD (no packaging):
Identify each food item and estimate weight in grams. Do NOT guess calorie counts -- a nutrition database will handle that.

Use visible objects as size references:
- Standard dinner plate = ~26cm diameter
- Standard fork = ~19cm
- If a hand is visible, use it for scale

For each item, estimate the weight in grams. Be conservative -- it's better to slightly overestimate than underestimate. If you're uncertain about an item (e.g., "is that mayo or yogurt?"), flag it with low confidence and a note.

Return items in the "items" array. Leave "nutritionLabel" empty.

MODE 2 — PACKAGED PRODUCT (bottle, can, box, jar, bag, protein bar, etc.):
If you see a packaged food or drink product:
- Read the product name from the packaging
- If a nutrition facts label is visible, read the EXACT values printed on it: calories, protein, carbs, fat, fiber, and serving size
- Convert the serving size to grams (e.g. "250ml milk" ≈ 258g, "1 bar (40g)" = 40g)
- Return these in the "nutritionLabel" field. Leave the "items" array empty.
- If the nutrition label is not visible or too blurry to read, identify the product by name and return it as a single item in the "items" array with your best weight estimate.

Return your analysis as structured JSON.`;

export const identifyFood = tool({
  description:
    "Analyze a food photo to identify items and estimate portion sizes, OR read nutrition facts from a packaged product label.",
  inputSchema: z.object({
    imageUrl: z.string().describe("URL of the food photo to analyze"),
  }),
  execute: async ({ imageUrl }) => {
    const result = await generateObject({
      model: openai("gpt-4.1"),
      schema: foodIdentificationSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: FOOD_IDENTIFICATION_PROMPT },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    });

    return result.object;
  },
});
