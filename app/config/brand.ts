/**
 * All branding in one place. Change these values to rename or re-skin the app.
 * The storefront widget gets `name` and `accentColor` through the published
 * config; the App Store listing texts live in docs/APP_STORE_LISTING.md.
 */
export const BRAND = {
  name: "Pickday",
  appStoreName: "Pickday: Delivery Date Picker",
  tagline: "Let customers pick the day. Set daily limits and stop most overbooking.",
  /** From the SUPPORT_EMAIL setting. Empty = no contact links are shown (never a made-up address). */
  supportEmail: (process.env.SUPPORT_EMAIL ?? "").trim(),
  website: "https://pickday.app",
  /** Primary colour used in admin illustrations and emails. */
  primaryColor: "#2c6ecb",
  /** Default accent for the storefront widget (merchants can change it). */
  accentColor: "#2c6ecb",
  logoUrl: "/logo.svg",
  /** "Powered by" link on the Free plan. */
  poweredByUrl: "https://pickday.app/?utm_source=widget",
} as const;
