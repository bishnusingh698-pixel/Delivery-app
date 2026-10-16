import type { ActionFunctionArgs } from "react-router";
import { authorized, daily, runInBackground } from "../services/jobs.server";

/** POST /jobs/daily with header X-Pickday-Secret (cron-job.org). Answers at once; work runs in the background. */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorized(request)) return new Response("Forbidden", { status: 403 });
  const started = runInBackground("daily", daily);
  return new Response(started ? "started" : "already running", { status: 202 });
};

export const loader = () => new Response("Method not allowed", { status: 405 });
