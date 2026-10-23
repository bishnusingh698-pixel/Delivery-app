/** Harness for the admin live preview (tests/browser/preview.browser.ts). */
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { LiveWidget } from "../../../app/components/live-preview";
import { I18nProvider } from "../../../app/i18n/react";
import en from "../../../app/i18n/admin/en.json";
import { defaultSettings } from "../../../core/defaults";
import { nowInZone } from "../../../core/tz";

const tz = "America/New_York";
const today = nowInZone(tz).date;
const s = defaultSettings("US");
s.methods.delivery.enabled = true;
s.methods.delivery.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
s.methods.delivery.slotsEnabled = true;
s.methods.delivery.capacity.slots = [{ id: "am", start: "09:00", end: "12:00", weekdays: [], max: null }];
s.notes = { enabled: true, methods: "all", maxLength: 100 };
const setId = s.holidays[0].id;
// Pretend tomorrow is a public holiday: the preview must show it closed.
const [y, m, d] = today.split("-").map(Number);
const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

function App() {
  const [accent, setAccent] = useState("#2c6ecb");
  const [hol, setHol] = useState(true);
  const settings = { ...s, widget: { ...s.widget, accent }, holidays: hol ? s.holidays : [] };
  return (
    <I18nProvider messages={en as Record<string, string>} lang="en">
      <button id="yellow" onClick={() => setAccent("#ffd700")}>yellow</button>
      <button id="noHolidays" onClick={() => setHol(false)}>no holidays</button>
      <LiveWidget
        settings={settings}
        meta={{ plan: "pro", timeZone: tz, primaryLocale: "en", currency: "USD", country: "US" }}
        holidayItems={{ [setId]: [{ key: "x", date: tomorrow, end: tomorrow, name: "Test Holiday", mayShift: false }] }}
        method="delivery"
      />
      <p id="tomorrow">{tomorrow}</p>
    </I18nProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
