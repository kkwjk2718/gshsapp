import { getGoogleAnalyticsId } from "@/lib/system-settings";

export type PublicSettings = {
  googleAnalyticsId: string | null;
};

export async function loadPublicSettings(
  loader: () => Promise<string | null> = getGoogleAnalyticsId,
): Promise<PublicSettings> {
  try {
    return {
      googleAnalyticsId: await loader(),
    };
  } catch (error) {
    console.error("[public-settings] Failed to load public settings:", error);
    return {
      googleAnalyticsId: null,
    };
  }
}
