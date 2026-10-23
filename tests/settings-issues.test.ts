import { describe, expect, it } from "vitest";
import { issueCode, validateSettings } from "../app/services/settings-schema.server";
import { defaultSettings } from "../core/defaults";

describe("plain-language save errors", () => {
  it("every failed save carries a code the admin can translate", () => {
    const s = defaultSettings();
    for (const m of Object.values(s.methods)) m.enabled = false;
    s.methods.delivery.schedule.windowDays = -5 as number;
    const r = validateSettings(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.every((i) => typeof i.code === "string")).toBe(true);
      expect(r.issues.map((i) => i.code)).toContain("atLeastOneMethod");
    }
  });
  it("maps zod issues to codes with limits", () => {
    expect(issueCode({ code: "too_small", origin: "number", minimum: 0, message: "" })).toEqual({ code: "tooSmall", limit: 0 });
    expect(issueCode({ code: "too_big", origin: "number", maximum: 5, message: "" })).toEqual({ code: "tooBig", limit: 5 });
    expect(issueCode({ code: "too_big", origin: "string", maximum: 80, message: "" })).toEqual({ code: "tooLong", limit: 80 });
    expect(issueCode({ code: "too_big", origin: "array", maximum: 3, message: "" })).toEqual({ code: "tooMany", limit: 3 });
    expect(issueCode({ code: "too_small", origin: "string", minimum: 1, message: "" })).toEqual({ code: "required" });
    expect(issueCode({ code: "invalid_type", message: "Invalid input: expected string, received undefined" })).toEqual({ code: "required" });
    expect(issueCode({ code: "invalid_format", message: "" })).toEqual({ code: "invalidFormat" });
    expect(issueCode({ code: "custom", message: "Two time slots overlap on the same weekday" })).toEqual({ code: "slotsOverlap" });
    expect(issueCode({ code: "invalid_value", message: "" })).toEqual({ code: "invalid" });
  });
});
