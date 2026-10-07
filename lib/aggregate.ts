import { summarize, type InventorySummary } from "./calc";
import { iso } from "./seed";
import type { Centre, Inventory, TenantConfig } from "./types";

export type PeriodKey = "jour" | "semaine" | "mois" | "trimestre" | "annee";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "jour", label: "Jour" },
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "trimestre", label: "Trimestre" },
  { value: "annee", label: "Année" },
];

const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** [start, end] inclusive ISO dates for the period and the one before it. */
export function periodRange(p: PeriodKey, today = new Date()): { cur: [string, string]; prev: [string, string] } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let s: Date;
  let prevS: Date;
  let prevE: Date;
  switch (p) {
    case "jour":
      return { cur: [iso(t), iso(t)], prev: [iso(add(t, -1)), iso(add(t, -1))] };
    case "semaine":
      s = add(t, -6);
      return { cur: [iso(s), iso(t)], prev: [iso(add(s, -7)), iso(add(t, -7))] };
    case "mois":
      s = new Date(t.getFullYear(), t.getMonth(), 1);
      prevS = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      prevE = new Date(t.getFullYear(), t.getMonth() - 1, Math.min(t.getDate(), new Date(t.getFullYear(), t.getMonth(), 0).getDate()));
      return { cur: [iso(s), iso(t)], prev: [iso(prevS), iso(prevE)] };
    case "trimestre":
      s = add(t, -89);
      return { cur: [iso(s), iso(t)], prev: [iso(add(s, -90)), iso(add(t, -90))] };
    case "annee":
      s = new Date(t.getFullYear(), 0, 1);
      return { cur: [iso(s), iso(t)], prev: [iso(new Date(t.getFullYear() - 1, 0, 1)), iso(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()))] };
  }
}

export const inRange = (d: string, [a, b]: [string, string]) => d >= a && d <= b;

export interface Aggregate {
  days: number;
  bottlesN: number;
  conditionneT: number;
  cumulSortieT: number;
  vracT: number;
  approT: number;
  utileMin: number;
  totalMin: number;
  stopMin: number;
  rendementTph: number;
  capacityPct: number;
  meanAbsEcart: number;
  ecartT: number;
  byBottle: Record<string, { n: number; t: number }>;
  stopsByType: Record<string, number>;
}

export function aggregate(
  invs: Inventory[],
  cfg: TenantConfig,
  centreOf: (id: string) => Centre,
  closedOnly = true,
): Aggregate {
  const list = closedOnly ? invs.filter((i) => i.status === "TERMINE") : invs;
  const a: Aggregate = {
    days: list.length,
    bottlesN: 0,
    conditionneT: 0,
    cumulSortieT: 0,
    vracT: 0,
    approT: 0,
    utileMin: 0,
    totalMin: 0,
    stopMin: 0,
    rendementTph: 0,
    capacityPct: 0,
    meanAbsEcart: 0,
    ecartT: 0,
    byBottle: {},
    stopsByType: {},
  };
  let capWeighted = 0;
  for (const inv of list) {
    const c = centreOf(inv.centreId);
    const s: InventorySummary = summarize(inv, c, cfg);
    a.bottlesN += s.bottlesDayN + s.bottlesNightN;
    a.conditionneT += s.conditionneT;
    a.cumulSortieT += s.cumulSortieT;
    a.vracT += s.vracT;
    a.approT += s.approT;
    a.utileMin += s.utileMin + s.nightUtileMin;
    a.totalMin += s.totalMin;
    a.stopMin += s.stopMin;
    a.meanAbsEcart += Math.abs(s.ecartPct);
    a.ecartT += s.ecart;
    capWeighted += s.capacityTph * (s.utileMin / 60);
    if (inv.night.enabled) {
      const nightCap = c.lines.filter((l) => inv.night.lineIds.includes(l.id)).reduce((x, l) => x + l.capacityTph, 0);
      capWeighted += nightCap * (s.nightUtileMin / 60);
    }
    for (const b of cfg.bottleTypes) {
      const n = (inv.bottles[b.id] ?? 0) + (inv.night.enabled ? inv.night.bottles[b.id] ?? 0 : 0);
      a.byBottle[b.id] ??= { n: 0, t: 0 };
      a.byBottle[b.id].n += n;
      a.byBottle[b.id].t += (n * b.kg) / 1000;
    }
    for (const st of inv.stops) a.stopsByType[st.type] = (a.stopsByType[st.type] ?? 0) + st.minutes;
  }
  a.meanAbsEcart = list.length ? a.meanAbsEcart / list.length : 0;
  a.rendementTph = a.utileMin ? a.conditionneT / (a.utileMin / 60) : 0;
  a.capacityPct = capWeighted ? (a.conditionneT / capWeighted) * 100 : 0;
  return a;
}

export function delta(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}
