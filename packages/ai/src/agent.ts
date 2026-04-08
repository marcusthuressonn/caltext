import { ToolLoopAgent, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { identifyFood } from "./tools/identify-food.js";
import { lookupNutrition } from "./tools/nutrition.js";
import { logMeal } from "./tools/log-meal.js";
import { getDailyLogTool, getWeeklyLogTool } from "./tools/get-history.js";
import { getUserProfile } from "./tools/get-profile.js";
import { saveMemoryTool } from "./tools/save-memory.js";
import { recallMemoryTool } from "./tools/recall-memory.js";

export function createCaltextAgent(systemPrompt: string) {
  return new ToolLoopAgent({
    model: openai("gpt-4.1"),
    instructions: systemPrompt,
    tools: {
      identifyFood,
      lookupNutrition,
      logMeal,
      getDailyLog: getDailyLogTool,
      getWeeklyLog: getWeeklyLogTool,
      getUserProfile,
      saveMemory: saveMemoryTool,
      recallMemory: recallMemoryTool,
    },
    stopWhen: stepCountIs(10),
  });
}
