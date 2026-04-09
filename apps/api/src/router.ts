import { createPhoneMapping, getOnboardingState, getUser, resolveUserId } from "@caltext/db";
import { decrypt, detectRegion, generateId } from "@caltext/shared";
import { start } from "workflow/api";
import { handleMessage } from "../workflows/handle-message";
import { onboardingWorkflow } from "../workflows/onboarding";

export async function routeMessage(
  encryptedPhone: string,
  text: string,
  imageUrl?: string,
): Promise<string> {
  const userId = await resolveUserId(encryptedPhone);

  if (!userId) {
    const newId = generateId();
    await createPhoneMapping(encryptedPhone, newId);
    const region = detectRegion(await decrypt(encryptedPhone));
    await start(onboardingWorkflow, [
      newId,
      encryptedPhone,
      region.locale,
      region.timezone,
      region.country,
      region.countryName,
    ]);
    return "__onboarding_started__";
  }

  const user = await getUser(userId);
  if (!user) return "Something went wrong. Try messaging me again!";

  if (user.onboardingComplete && !user.consentedAt) {
    return "Your data processing consent has been withdrawn. Message me again if you'd like to start over!";
  }

  if (!user.onboardingComplete) {
    const onboardingState = await getOnboardingState(userId);
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

  await start(handleMessage, [userId, text, imageUrl]);
  return "__assistant_started__";
}
