import { userExists, getUser, getOnboardingState } from "@caltext/db";
import { detectRegion } from "@caltext/shared";
import { start } from "workflow/api";
import { onboardingWorkflow } from "../workflows/onboarding.js";
import { handleMessage } from "../workflows/handle-message.js";

export async function routeMessage(phone: string, text: string, imageUrl?: string): Promise<string> {
  const exists = await userExists(phone);

  if (!exists) {
    const region = detectRegion(phone);
    await start(onboardingWorkflow, [phone, region.locale, region.timezone, region.country, region.countryName]);
    return "__onboarding_started__";
  }

  const user = await getUser(phone);
  if (!user) return "Something went wrong. Try messaging me again!";

  if (!user.onboardingComplete) {
    const onboardingState = await getOnboardingState(phone);
    if (onboardingState?.webhookUrl) {
      try {
        await fetch(onboardingState.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, imageUrl }),
        });
        return "__onboarding_resumed__";
      } catch {
        return "I'm having trouble processing that. Can you try again?";
      }
    }
    return "Let me restart your setup. What's your name?";
  }

  await start(handleMessage, [phone, text, imageUrl]);
  return "__assistant_started__";
}
