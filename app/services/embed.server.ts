/**
 * Is the Pickday app embed turned on in the live theme? Read-only check of the
 * main theme's settings (read_themes). Used by Home's setup guide and alerts.
 */
import { flagsOf, requireShop, setFlags } from "../models/shop.server";
import { schedulePublish } from "./publish.server";
import { gql, type AdminGraphql } from "./graphql.server";

export function embedEnabledIn(settingsData: string): boolean {
  // settings_data.json may start with a comment block.
  const json = settingsData.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
  try {
    const data = JSON.parse(json);
    const blocks: Record<string, { type?: string; disabled?: boolean }> = data?.current?.blocks ?? {};
    const handle = (process.env.SHOPIFY_APP_HANDLE || "pickday").toLowerCase();
    return Object.values(blocks).some((b) => {
      const m = typeof b.type === "string" ? /^shopify:\/\/apps\/([^/]+)\/blocks\/app-embed\//.exec(b.type) : null;
      return !!m && (m[1].toLowerCase() === handle || m[1].toLowerCase().includes("pickday")) && !b.disabled;
    });
  } catch {
    return false;
  }
}

export async function checkEmbed(shop: string, admin: AdminGraphql): Promise<boolean | null> {
  try {
    const d = await gql(
      admin,
      `query { themes(first: 1, roles: [MAIN]) { nodes { id files(filenames: ["config/settings_data.json"]) { nodes { body { ... on OnlineStoreThemeFileBodyText { content } } } } } } }`,
    );
    const content = d.themes?.nodes?.[0]?.files?.nodes?.[0]?.body?.content;
    if (typeof content !== "string") return null;
    const on = embedEnabledIn(content);
    const before = flagsOf(await requireShop(shop)).embedDetected;
    await setFlags(shop, { embedDetected: on, embedCheckedAt: new Date().toISOString() });
    // The checkout Function relaxes "date required" while the embed is off: republish when that changes.
    if (before !== on) schedulePublish(shop);
    return on;
  } catch (e) {
    console.error("[embed]", shop, (e as Error).message);
    return null;
  }
}

/** Theme editor deep link with the app embed preselected. */
export function themeEditorLink(shop: string, apiKey = process.env.SHOPIFY_API_KEY ?? "") {
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/app-embed`;
}
