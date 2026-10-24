import { describe, expect, it } from "vitest";
import { unsafeStrings, validateSettings } from "../app/services/settings-schema.server";
import { settings } from "./helpers";

describe("settings validation", () => {
  it("refuses text that would end the storefront's script block (B11)", () => {
    const s = settings((x) => {
      x.texts = { en: { heading: "Pick a day</script><script>alert(1)</script>" } };
      x.methods.delivery.names = { en: "Delivery <!-- hi" };
    });
    expect(unsafeStrings(s).sort()).toEqual(["methods.delivery.names.en", "texts.en.heading"]);
    const r = validateSettings(s);
    expect(r.ok).toBe(false);
  });

  it("accepts ordinary text with < and > (custom CSS child selectors)", () => {
    const s = settings((x) => {
      x.widget.customCss = ".pd-root > p { color: red }";
      x.texts = { en: { heading: "Orders < 2 kg ship free" } };
    });
    expect(validateSettings(s).ok).toBe(true);
  });

  it("caps the booking window at the 400 days the engine scans (B13)", () => {
    expect(validateSettings(settings((x) => (x.methods.shipping.schedule.windowDays = 401))).ok).toBe(false);
    expect(validateSettings(settings((x) => (x.methods.shipping.schedule.windowDays = 400))).ok).toBe(true);
  });
});
