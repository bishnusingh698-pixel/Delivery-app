import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  BillingReplacementBehavior,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { onInstall } from "./services/install.server";
import { ALL_BILLING_NAMES, BILLING_NAMES, TRIAL_DAYS, price, type BillingIntervalId, type PaidPlanId } from "../core/plans";

export const PLAN_STARTER = BILLING_NAMES.starter.monthly;
export const PLAN_PRO = BILLING_NAMES.pro.monthly;
/** Every subscription name Pickday sells; pass this to every billing.check. */
export const BILLING_PLAN_NAMES = ALL_BILLING_NAMES;

/** One billing plan per paid plan and interval; prices and trial come from core/plans.ts. */
const billingPlan = (plan: PaidPlanId, interval: BillingIntervalId) => ({
  trialDays: TRIAL_DAYS,
  // Shopify decides: upgrades apply now, cheaper plans on the same interval at the next cycle (D-52).
  replacementBehavior: BillingReplacementBehavior.Standard,
  lineItems: [
    {
      amount: price(plan, interval),
      currencyCode: "USD",
      interval: interval === "yearly" ? BillingInterval.Annual : BillingInterval.Every30Days,
    } as const,
  ],
});

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [BILLING_NAMES.starter.monthly]: billingPlan("starter", "monthly"),
    [BILLING_NAMES.starter.yearly]: billingPlan("starter", "yearly"),
    [BILLING_NAMES.pro.monthly]: billingPlan("pro", "monthly"),
    [BILLING_NAMES.pro.yearly]: billingPlan("pro", "yearly"),
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      // Create the shop row + default settings and publish them. Idempotent.
      await onInstall(session, admin);
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
