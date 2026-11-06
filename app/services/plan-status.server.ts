/**
 * The store's plan as Shopify sees it right now, with its trial end: shown on Home and the Plans page.
 * Shopify is the source of truth (D-72): a difference with our copy is applied on the spot.
 */
import type { PlanId } from "../../core/types";
import { trialEndsOn } from "../../core/usage";
import { authenticate, PLAN_PRO, PLAN_STARTER } from "../shopify.server";
import { applySubscription, billingTest } from "./billing.server";
import { releaseAfterUpgrade } from "./orders.server";
import type { AdminContext } from "./settings.server";

export interface PlanStatus {
  plan: PlanId;
  /** Store-local day the free trial ends, while in a trial. */
  trialEndsOn: string | null;
}

export async function planStatus(request: Request, ctx: AdminContext): Promise<PlanStatus> {
  try {
    const { billing } = await authenticate.admin(request);
    const check = await billing.check({ plans: [PLAN_STARTER, PLAN_PRO], isTest: billingTest(ctx.row) });
    const sub = check.appSubscriptions[0] ?? null;
    let plan = ctx.plan;
    const change = await applySubscription(ctx.shop, sub ? { id: sub.id, name: sub.name, status: sub.status } : null);
    if (change) {
      plan = change.to;
      await releaseAfterUpgrade(ctx.shop, ctx.admin, change);
    }
    return { plan, trialEndsOn: sub ? trialEndsOn(sub, ctx.row.timeZone) : null };
  } catch (e) {
    console.error("[plans] billing check", ctx.shop, (e as Error).message);
    return { plan: ctx.plan, trialEndsOn: null };
  }
}
