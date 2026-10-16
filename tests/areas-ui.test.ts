import { describe, expect, it } from "vitest";
import {
  bareRegion,
  newCountryAreas,
  newZone,
  parseRegionCodes,
  postcodeMessage,
  postcodeProblems,
  pruneZoneAreas,
  sameLines,
  testAddress,
  textToLines,
  validateAreas,
  zoneHasOverrides,
} from "../core/areas-ui";
import type { Settings } from "../core/types";

const msg = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe("postcode lines", () => {
  it("cleans textarea text into rule lines", () => {
    expect(textToLines(" 10115 \n\nSW1*\r\n  1000-1999  \n")).toEqual(["10115", "SW1*", "1000-1999"]);
    expect(sameLines("a\n\nb\n", ["a", "b"])).toBe(true);
    expect(sameLines("a\nc", ["a", "b"])).toBe(false);
  });

  it("reports unreadable lines with their line numbers", () => {
    const p = postcodeProblems(["10115", "SW1*", "1000-1999", "ab!c", "**"]);
    expect(p.valid).toBe(3);
    expect(p.invalid).toEqual([
      { line: 4, text: "ab!c" },
      { line: 5, text: "**" },
    ]);
    expect(postcodeMessage(["10115"], msg)).toBeUndefined();
    expect(postcodeMessage(["10115", "ab!c"], msg)).toContain('"line":2');
  });

  it("summarises many bad lines and flags overly long ones", () => {
    const m = postcodeMessage(["!", "?", "#", "$", "%"], msg, 3)!;
    expect(m).toContain("areas.moreBadLines");
    expect(m).toContain('"count":2');
    expect(postcodeMessage(["1".repeat(61)], msg)).toContain("areas.lineTooLong");
  });
});

describe("regions", () => {
  it("parses codes with or without the country prefix", () => {
    expect(bareRegion("us-ca")).toBe("CA");
    expect(parseRegionCodes("US-CA, ny; ca\nTX")).toEqual(["CA", "NY", "TX"]);
  });
});

describe("validation", () => {
  it("lists problems with settings paths", () => {
    const de = { ...newCountryAreas("DE"), postcodes: ["10115", "bad!"] };
    const fr = { ...newCountryAreas("FR", "area"), areas: [{ id: "area_1", names: { fr: "Centre" } }] };
    const z = newZone("zone_1", "", "DE");
    const issues = validateAreas({ areas: [de, fr, { ...newCountryAreas("DE"), postcodes: ["1*"] }], zones: [z] }, "en", msg);
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("areas.0.postcodes");
    expect(paths).toContain("areas.1.areas.0.names");
    expect(paths).toContain("areas.2.country");
    expect(paths).toContain("zones.0.name");
    expect(paths).toContain("zones.0.match");
  });

  it("accepts a clean setup", () => {
    const d = {
      areas: [{ ...newCountryAreas("DE"), postcodes: ["10*"] }, newCountryAreas("AT", "none")],
      zones: [{ ...newZone("zone_1", "North", "DE"), postcodes: ["101*"] }],
    };
    expect(validateAreas(d, "en", msg)).toEqual([]);
  });

  it("drops zone links to deleted areas", () => {
    const d = {
      areas: [{ ...newCountryAreas("FR", "area"), areas: [{ id: "a1", names: { en: "A" } }] }],
      zones: [{ ...newZone("z", "Z", "FR"), areas: ["a1", "gone"] }],
    };
    pruneZoneAreas(d);
    expect(d.zones[0].areas).toEqual(["a1"]);
  });
});

describe("test an address", () => {
  const d: Pick<Settings, "areas" | "zones"> = {
    areas: [
      { ...newCountryAreas("GB"), postcodes: ["SW1*", "E1*"] },
      { ...newCountryAreas("US", "region"), regions: ["CA"] },
    ],
    zones: [
      { ...newZone("z1", "West", "GB"), postcodes: ["SW1A*"] },
      { ...newZone("z2", "Central", "GB"), postcodes: ["SW1*"] },
      { ...newZone("z3", "Cali", "US"), regions: ["US-CA"] },
    ],
  };

  it("uses the first matching zone", () => {
    const r = testAddress(d, { country: "GB", postcode: "sw1a 1aa" });
    expect(r.covered).toBe(true);
    expect(r.zone?.name).toBe("West");
    expect(testAddress(d, { country: "GB", postcode: "SW1P 3BU" }).zone?.name).toBe("Central");
  });

  it("reports not delivered and no zone", () => {
    const r = testAddress(d, { country: "GB", postcode: "N1 9GU" });
    expect(r).toEqual({ covered: false, zone: null });
  });

  it("matches regions and treats other countries as unrestricted", () => {
    expect(testAddress(d, { country: "US", region: "US-CA" }).covered).toBe(true);
    expect(testAddress(d, { country: "US", region: "CA" }).zone?.name).toBe("Cali");
    expect(testAddress(d, { country: "US", region: "NY" }).covered).toBe(false);
    expect(testAddress(d, { country: "DE", postcode: "10115" }).covered).toBeNull();
  });

  it("knows when a zone has its own rules", () => {
    expect(zoneHasOverrides(newZone("z", "Z", "GB"))).toBe(false);
    expect(zoneHasOverrides({ ...newZone("z", "Z", "GB"), schedule: { weekdays: [2, 4] } })).toBe(true);
  });
});
