/**
 * GET /healthz — called by cron-job.org every 10 minutes to keep the Render
 * free instance awake. Returns instantly and never touches the database
 * (Neon is allowed to sleep).
 */
export const loader = () =>
  new Response("ok", { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
