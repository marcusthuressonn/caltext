import { tool } from "ai";
import { z } from "zod";

export const foodIdentificationSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe("Common food name, e.g. 'grilled chicken breast'"),
    estimatedGrams: z.number().describe("Estimated weight in grams based on visual cues"),
    preparationMethod: z.string().describe("How it appears prepared: raw, grilled, fried, boiled, etc."),
    confidence: z.enum(["high", "medium", "low"]),
    notes: z.string().optional().describe("Anything uncertain, e.g. 'could be diet or regular'"),
  })),
  sceneContext: z.string().optional().describe("Visible reference objects: plate size, utensils, hands"),
});

export type FoodIdentification = z.infer<typeof foodIdentificationSchema>;

export const FOOD_IDENTIFICATION_PROMPT = `Analyze this food photo. Your job is ONLY to identify food items and estimate their weight in grams. Do NOT guess calorie counts -- a nutrition database will handle that.

Use visible objects as size references:
- Standard dinner plate = ~26cm diameter
- Standard fork = ~19cm
- If a hand is visible, use it for scale

For each item, estimate the weight in grams. Be conservative -- it's better to slightly overestimate than underestimate. If you're uncertain about an item (e.g., "is that mayo or yogurt?"), flag it with low confidence and a note.

Return your analysis as structured JSON.`;

export const identifyFood = tool({
  description: "Analyze a food photo to identify items and estimate portion sizes in grams. Do NOT estimate calories -- only identify food and weight.",
  inputSchema: z.object({
    imageUrl: z.string().describe("URL of the food photo to analyze"),
  }),
  execute: async ({ imageUrl }) => {
    const { generateObject } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");

    const result = await generateObject({
      model: openai("gpt-4.1"),
      schema: foodIdentificationSchema,
      messages: [
        { role: "user", content: [
          { type: "text", text: FOOD_IDENTIFICATION_PROMPT },
          { type: "image", image: new URL(imageUrl) },
        ]},
      ],
    });

    return result.object;
  },
});
