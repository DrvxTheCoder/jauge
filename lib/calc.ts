import type { Centre, Inventory, InventoryClosing, Rules, TankOutcome, TankResult, TenantConfig } from "./types";
import { profileFallbackWarning, profileFor, roundT, tankResult } from "./correction";

/* ------------------------------------------------------------------
   Measurement engine. Tank tonnage comes from the tenant's correction
   profiles (lib/correction). This module adds the per-inventory view:
   live results while an inventory is open, the frozen snapshot once closed.
   ------------------------------------------------------------------ */

export { ambientDensity, gasMass, profileFor, tankResult } from "./correction";
export type { TankOutcome, TankResult } from "./types";

export const round1 = roundT;

/** Results computed now, with the current profiles, for every tank that has a reading. */
export function liveTankOutcomes(inv: Inventory, centre: Centre, cfg: TenantConfig): Record<string, TankOutcome> {
  const out: Record<string, TankOutcome> = {};
  for (const res of centre.reservoirs) {
    const r = inv.tanks[res.id];
    if (!r) continue;
    const o = tankResult(r, res, profileFor(cfg, res));
    const fallback = profileFallbackWarning(cfg, res);
    out[res.id] = fallback ? { ...o, warnings: [fallback, ...o.warnings] } : o;
  }
  return out;
}

/** What the inventory shows: the closing snapshot when there is one, live results otherwise. */
export function tankOutcomes(inv: Inventory, centre: Centre, cfg: TenantConfig): Record<string, TankOutcome> {
  return inv.closing ? inv.closing.tanks : liveTankOutcomes(inv, centre, cfg);
}

/** Freezes the factors used for each tank. Written at closing and on every admin edit of a closed inventory. */
export function buildClosing(inv: Inventory, centre: Centre, cfg: TenantConfig): InventoryClosing {
  const live = liveTankOutcomes(inv, centre, cfg);
  const tanks: Record<string, TankResult> = {};
  const warnings: string[] = [];
  for (const res of centre.reservoirs) {
    const o = live[res.id];
    if (!o) continue;
    for (const w of o.warnings) warnings.push(`${res.name} : ${w}`);
    if (!o.blocked) tanks[res.id] = o;
  }
  const p = profileFor(cfg, {});
  return { profileId: p.id, profileVersion: p.version, tanks, warnings };
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
  frozen: boolean; // tank results come from the closing snapshot
  tankWarnings: string[]; // prefixed with the tank name
  blockedTanks: string[]; // names of tanks with a reading but no result
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
  // Physical stock counts what each tank's profile says (liquid, or liquid + gas).
  const tanks = tankOutcomes(inv, centre, cfg);
  let stockPhys = 0;
  const tankWarnings: string[] = [];
  const blockedTanks: string[] = [];
  for (const res of centre.reservoirs) {
    const o = tanks[res.id];
    if (o && !o.blocked) stockPhys += o.stockT;
    if (inv.tanks[res.id] && (!o || o.blocked)) blockedTanks.push(res.name);
    if (o && !inv.closing) for (const w of o.warnings) tankWarnings.push(`${res.name} : ${w}`);
  }
  if (inv.closing) tankWarnings.push(...inv.closing.warnings);
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
    frozen: !!inv.closing,
    tankWarnings,
    blockedTanks,
  };
}

export type Band = "ok" | "warn" | "alert";
export function ecartBand(pct: number, rules: Rules): Band {
  const a = Math.abs(pct);
  if (a <= rules.ecartOk) return "ok";
  if (a <= rules.ecartWarn) return "warn";
  return "alert";
}
