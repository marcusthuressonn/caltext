import { tool } from "ai";
import { z } from "zod";
import { recallAllMemories } from "@caltext/db";

export const recallMemoryTool = tool({
  description: "Recall all saved preferences and facts about this user. Use this to get context before responding, especially about dietary restrictions, allergies, and preferences.",
  inputSchema: z.object({
    phone: z.string(),
  }),
  execute: async ({ phone }) => {
    const memories = await recallAllMemories(phone);
    if (Object.keys(memories).length === 0) {
      return { memories: null, message: "No saved memories for this user yet." };
    }
    return { memories };
  },
});
