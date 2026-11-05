/**
 * Sensible defaults per country: working days, first day of the week and the
 * usual numeric date format. Used by the setup wizard and the country selector
 * in Settings (the merchant can change every value afterwards).
 */
import { SATURDAY_START, SUNDAY_START } from "./i18n/week";
import type { DateFormat } from "./types";

export interface RegionDefaults {
  /** Weekdays the business usually works / delivers (0 = Sunday). */
  workdays: number[];
  weekStart: 0 | 1 | 6;
  dateFormat: Exclude<DateFormat, "auto" | "long">;
}

const MON_FRI = [1, 2, 3, 4, 5];
const SUN_THU = [0, 1, 2, 3, 4];
const SAT_WED = [6, 0, 1, 2, 3];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const SUN_FRI = [0, 1, 2, 3, 4, 5];

/** Weekends that differ from Saturday + Sunday. */
const WORKDAYS: Record<string, number[]> = {
  // Friday + Saturday weekend
  SA: SUN_THU, KW: SUN_THU, QA: SUN_THU, BH: SUN_THU, OM: SUN_THU, EG: SUN_THU, JO: SUN_THU, IQ: SUN_THU,
  LY: SUN_THU, SD: SUN_THU, SY: SUN_THU, YE: SUN_THU, DZ: SUN_THU, BD: SUN_THU, IL: SUN_THU, MV: SUN_THU, PS: SUN_THU,
  // Thursday + Friday weekend
  IR: SAT_WED, AF: SAT_WED,
  // Saturday only
  NP: SUN_FRI,
  // Friday + Sunday
  BN: [1, 2, 3, 4, 6],
  // Six-day working weeks are the norm for shops and couriers
  IN: MON_SAT,
};

const MDY = new Set(["US", "PH", "FM", "MH", "PW", "AS", "GU", "MP", "PR", "VI", "UM", "BZ", "CA"]);
const YMD = new Set(["CN", "JP", "KR", "KP", "TW", "HU", "LT", "MN", "SE", "IR", "BT"]);

export function regionDefaults(country: string | null | undefined): RegionDefaults {
  const c = (country ?? "").toUpperCase();
  return {
    workdays: WORKDAYS[c] ?? MON_FRI,
    weekStart: SUNDAY_START.has(c) ? 0 : SATURDAY_START.has(c) ? 6 : 1,
    dateFormat: MDY.has(c) ? "mdy" : YMD.has(c) ? "ymd" : "dmy",
  };
}

/**
 * Every country a store can be in (ISO 3166-1 alpha-2, plus XK for Kosovo as Shopify uses it).
 * Not tied to the holiday dataset: a store in Kuwait or Nepal must be able to pick its country
 * (and get its weekend) even though there is no holiday list for it.
 */
export const ALL_COUNTRIES: readonly string[] = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ
  BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR
  CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
  LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
  MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF
  PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
  SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR
  TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/);
