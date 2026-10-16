/** Calls the Pickday backend (relative URLs are sent to the app with a session token). */
export interface Day {
  date: string;
  available: boolean;
  reason: string | null;
  left: number | null;
  slots: { id: string; label: string; available: boolean; left: number | null }[];
}

export interface ScheduleData {
  order: { method: string; date: string | null; slot: string | null; locationId: string | null; status?: string; limited?: boolean; history?: { from: { date: string | null } | null; to: { date: string } }[] } | null;
  name: string;
  needsDate: boolean;
  methods: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  method: string;
  locationId: string | null;
  timeZone: string;
  days: Day[];
}

export const numericId = (gid: string) => gid.split("/").pop() ?? gid;

export async function load(kind: "order" | "draft", id: string, method?: string, location?: string | null): Promise<ScheduleData> {
  const q = new URLSearchParams();
  if (method) q.set("method", method);
  if (location) q.set("location", location);
  const res = await fetch(`/api/${kind}/${numericId(id)}?${q}`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function save(kind: "order" | "draft", id: string, body: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`/api/${kind}/${numericId(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}
