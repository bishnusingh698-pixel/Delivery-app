/** Renders the REAL day sheet and production list (app/services/print.server.ts) with sample orders. */
import { writeFileSync, mkdirSync } from "node:fs";
import { daySheet, productionSheet } from "../../app/services/print.server";
import { loadMessages, makeT } from "../../app/i18n";
import { defaultSettings } from "../../core/defaults";

const out = "marketing/out/parts";
mkdirSync(out, { recursive: true });
const t = makeT(await loadMessages("en"), "en");
const s = defaultSettings("US");
s.locations = [{ id: "main", shopifyLocationId: null, name: "Juniper Street Bakery", address: "14 Juniper St", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null }];
const o = (n: number, method: string, slot: string | null, first: string, items: [string, number, string?][], loc: string | null = null) => ({
  id: String(n), shop: "x", orderId: String(n), orderName: `#${n}`, customerFirst: first, method, date: "2026-11-10", slotLabel: slot, locationId: loc, zoneId: null, area: null,
  itemCount: items.reduce((a, i) => a + i[1], 0), items: items.map(([title, qty, variant]) => ({ title, qty, variant: variant ?? null })), status: "open", limited: true, tags: [],
}) as any;
const orders = [
  o(1041, "delivery", "09:00-12:00", "Maya", [["Birthday cake", 1, "Chocolate · 8 in"], ["Candles", 1]]),
  o(1044, "delivery", "09:00-12:00", "Daniel", [["Sourdough loaf", 2]]),
  o(1047, "delivery", "12:00-15:00", "Priya", [["Croissant box", 1, "12 pieces"]]),
  o(1038, "pickup", "08:00-11:00", "Leo", [["Sourdough loaf", 1], ["Cinnamon rolls", 6]], "main"),
  o(1049, "pickup", "11:00-14:00", "Hana", [["Birthday cake", 1, "Vanilla · 6 in"]], "main"),
];
const live = new Map<string, any>([
  ["1041", { note: "Gift: Happy 30th, Sam!", phone: null, address: { name: "Maya R.", address1: "220 Elm Ave", address2: "Apt 4", zip: "11215", city: "Brooklyn", phone: null } }],
  ["1044", { note: "Leave it at the back door", phone: null, address: { name: "Daniel K.", address1: "18 Pine St", address2: null, zip: "11217", city: "Brooklyn", phone: null } }],
  ["1047", { note: null, phone: null, address: { name: "Priya S.", address1: "9 Oak Pl", address2: null, zip: "11238", city: "Brooklyn", phone: null } }],
]);
writeFileSync(`${out}/day-sheet.html`, daySheet(t, "en", s, "2026-11-10", "Tuesday, November 10, 2026", orders, live));
writeFileSync(`${out}/production.html`, productionSheet(t, "en", "Tuesday, November 10, 2026", [
  { title: "Sourdough loaf", variant: null, qty: 38, orders: 24, slots: [{ slot: "09:00-12:00", qty: 16 }, { slot: "12:00-15:00", qty: 22 }] },
  { title: "Birthday cake", variant: "Chocolate · 8 in", qty: 6, orders: 6, slots: [{ slot: "09:00-12:00", qty: 4 }, { slot: "12:00-15:00", qty: 2 }] },
  { title: "Croissant box", variant: "12 pieces", qty: 11, orders: 9, slots: [{ slot: "09:00-12:00", qty: 7 }, { slot: "12:00-15:00", qty: 4 }] },
  { title: "Cinnamon rolls", variant: null, qty: 54, orders: 12, slots: [{ slot: "08:00-11:00", qty: 30 }, { slot: "11:00-14:00", qty: 24 }] },
]));
console.log("ok");
