import type { Centre, Inventory, Reservoir, Rules, TankReading, TenantConfig } from "./types";

/* ------------------------------------------------------------------
   Measurement engine (prototype).
   Production version: plug the standard LPG volume-correction tables
   (ASTM D1250 / API MPMS 11.2.4, Table 54E) keyed on density @15°C and
   temperature in 0.1°C steps — round with Math.round(t * 10) / 10.
   Here a linear expansion approximation stands in for the lookup.
   ------------------------------------------------------------------ */

const ALPHA = 0.00275; // ~ thermal expansion of commercial butane/propane mix, per °C
const R = 8.314462;
const MOLAR_MASS = 0.0552; // kg/mol, butane-rich mix
const ATM = 1.01325;

export const round1 = (t: number) => Math.round(t * 10) / 10;

/** Liquid volume correction factor to 15°C. */
export function vcfLiquid(tC: number): number {
  return 1 - ALPHA * (round1(tC) - 15);
}

/** Vapour factor: converts headspace volume to equivalent at 15°C / 1 atm. */
export function vapourFactor(tC: number, gaugeBar: number): number {
  return (288.15 / (tC + 273.15)) * ((gaugeBar + ATM) / ATM);
}

export interface TankResult {
  vcf: number;
  vapFactor: number;
  densAmb: number; // t/m³ at ambient
  liquidT: number;
  gasT: number;
  totalT: number;
  fillPct: number; // of capacity in tonnes
}

export function tankResult(r: TankReading, res: Reservoir): TankResult {
  const vcf = vcfLiquid(r.tLiq);
  const densAmb = r.d15 * vcf;
  const liquidT = r.volLiqM3 * densAmb;
  const vapVol = Math.max(res.capacityM3 - r.volLiqM3, 0);
  const pAbsPa = (r.pressureBar + ATM) * 1e5;
  const gasT = (pAbsPa * vapVol * MOLAR_MASS) / (R * (r.tVap + 273.15)) / 1000;
  return {
    vcf,
    vapFactor: vapourFactor(r.tVap, r.pressureBar),
    densAmb,
    liquidT,
    gasT,
    totalT: liquidT + gasT,
    fillPct: res.capacityT ? (liquidT / res.capacityT) * 100 : 0,
  };
}

/* ---------------- time ---------------- */

export function toMin(hhmm: string): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function spanMin(start: string, end: string): number {
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : b + 1440 - a; // crosses midnight
}

export function nowHHMM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---------------- mass balance ---------------- */

export interface InventorySummary {
  approT: number;
  vracT: number;
  bottlesDayT: number;
  bottlesNightT: number;
  bottlesDayN: number;
  bottlesNightN: number;
  conditionneT: number;
  cumulSortieT: number;
  stockTheo: number;
  stockPhys: number;
  ecart: number;
  ecartPct: number;
  totalMin: number;
  stopMin: number;
  utileMin: number;
  rendementPct: number;
  rendementTph: number;
  capacityTph: number;
  capacityPct: number;
  nightUtileMin: number;
  nightTph: number;
  nightCapacityPct: number;
  stockCapacityT: number;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);

export function bottleTonnes(bottles: Record<string, number>, cfg: TenantConfig) {
  let t = 0;
  let n = 0;
  for (const b of cfg.bottleTypes) {
    const q = Number(bottles[b.id]) || 0;
    n += q;
    t += (q * b.kg) / 1000;
  }
  return { t, n };
}

export function summarize(inv: Inventory, centre: Centre, cfg: TenantConfig, now?: Date): InventorySummary {
  const approT = sum(inv.appro);
  const vracT = sum(inv.sorties);
  const day = bottleTonnes(inv.bottles, cfg);
  const night = inv.night.enabled ? bottleTonnes(inv.night.bottles, cfg) : { t: 0, n: 0 };

  const stockTheo = inv.stockInitial - night.t + approT - vracT - day.t;
  let stockPhys = 0;
  for (const res of centre.reservoirs) {
    const r = inv.tanks[res.id];
    if (r) stockPhys += tankResult(r, res).liquidT;
  }
  const ecart = stockPhys - stockTheo;
  const ecartPct = stockTheo ? (ecart / stockTheo) * 100 : 0;

  const end = inv.heureFin || (inv.status === "EN_COURS" ? nowHHMM(now) : "");
  const span = spanMin(inv.heureDebut, end);
  const totalMin = Math.max(span - (span > cfg.rules.lunchBreakMin * 2 ? cfg.rules.lunchBreakMin : 0), 0);
  const stopMin = inv.stops.reduce((a, s) => a + s.minutes, 0);
  const utileMin = Math.max(totalMin - stopMin, 0);
  const capacityTph = centre.lines.reduce((a, l) => a + l.capacityTph, 0);
  const rendementTph = utileMin ? day.t / (utileMin / 60) : 0;

  const nightUtileMin = inv.night.enabled ? Math.max(inv.night.thtMin - inv.night.taMin, 0) : 0;
  const nightCap = centre.lines.filter((l) => inv.night.lineIds.includes(l.id)).reduce((a, l) => a + l.capacityTph, 0);
  const nightTph = nightUtileMin ? night.t / (nightUtileMin / 60) : 0;

  return {
    approT,
    vracT,
    bottlesDayT: day.t,
    bottlesNightT: night.t,
    bottlesDayN: day.n,
    bottlesNightN: night.n,
    conditionneT: day.t + night.t,
    cumulSortieT: vracT + day.t + night.t,
    stockTheo,
    stockPhys,
    ecart,
    ecartPct,
    totalMin,
    stopMin,
    utileMin,
    rendementPct: totalMin ? (utileMin / totalMin) * 100 : 0,
    rendementTph,
    capacityTph,
    capacityPct: capacityTph ? (rendementTph / capacityTph) * 100 : 0,
    nightUtileMin,
    nightTph,
    nightCapacityPct: nightCap ? (nightTph / nightCap) * 100 : 0,
    stockCapacityT: centre.reservoirs.reduce((a, r) => a + r.capacityT, 0),
  };
}

export type Band = "ok" | "warn" | "alert";
export function ecartBand(pct: number, rules: Rules): Band {
  const a = Math.abs(pct);
  if (a <= rules.ecartOk) return "ok";
  if (a <= rules.ecartWarn) return "warn";
  return "alert";
}
