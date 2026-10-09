import type { CorrectionRow } from "../types";

/* ------------------------------------------------------------------
   Correction tables: exact-row lookup and validation.
   Rows are keyed by integer tenths of a degree (Math.round(t * 10)),
   so 25.1 always finds its row and floats are never compared for equality.
   ------------------------------------------------------------------ */

export const tenths = (t: number) => Math.round(t * 10);

/** Temperature rounded to tenths, as the lookup reads it. */
export const roundT = (t: number) => tenths(t) / 10;

/** French display of a tenth-rounded temperature: 25.1 → "25,1". */
export const fmtTemp = (t: number) => roundT(t).toFixed(1).replace(".", ",");

interface TableIndex {
  min: number; // in tenths
  max: number;
  byKey: Map<number, CorrectionRow>;
}

const indexes = new WeakMap<readonly CorrectionRow[], TableIndex>();

function indexOf(rows: readonly CorrectionRow[]): TableIndex | null {
  if (!rows.length) return null;
  let idx = indexes.get(rows);
  if (!idx) {
    const byKey = new Map<number, CorrectionRow>();
    for (const r of rows) byKey.set(tenths(r.t), r);
    const keys = [...byKey.keys()];
    idx = { min: Math.min(...keys), max: Math.max(...keys), byKey };
    indexes.set(rows, idx);
  }
  return idx;
}

export interface RowLookup {
  row: CorrectionRow;
  /** Set when the temperature is outside the table and the boundary row was read instead. */
  clamped: "below" | "above" | null;
}

/**
 * Reads the row for `t` rounded to tenths. Outside the table it returns the
 * boundary row with `clamped` set, so the caller can apply its policy and warn.
 * Returns null for an empty table or a missing row inside the range.
 */
export function lookupRow(rows: readonly CorrectionRow[], t: number): RowLookup | null {
  const idx = indexOf(rows);
  if (!idx || !Number.isFinite(t)) return null;
  const k = tenths(t);
  const clamped = k < idx.min ? "below" : k > idx.max ? "above" : null;
  const row = idx.byKey.get(clamped === "below" ? idx.min : clamped === "above" ? idx.max : k);
  return row ? { row, clamped } : null;
}

export function tableRange(rows: readonly CorrectionRow[]): [number, number] | null {
  const idx = indexOf(rows);
  return idx ? [idx.min / 10, idx.max / 10] : null;
}

/* ---------------- validation ---------------- */

export interface TableError {
  row: number; // 1-based position in `rows`; 0 for the table as a whole
  column?: "temperature" | "liquid" | "gas";
  message: string;
}

const OUTLIER_FACTOR = 5;
const EPS = 1e-9;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Rows whose value jumps away from its neighbours: deviation from the average
 * of the two neighbours above OUTLIER_FACTOR × the median step. Only the local
 * peak is reported, so a single bad value does not also flag the rows around it.
 */
function outliers(vals: number[]): Set<number> {
  const n = vals.length;
  const out = new Set<number>();
  if (n < 3) return out;
  const steps = vals.slice(1).map((v, i) => v - vals[i]);
  const limit = OUTLIER_FACTOR * median(steps.map(Math.abs)) + EPS;
  const typical = median(steps);
  const dev = vals.map((v, i) => {
    if (i === 0) return Math.abs(vals[1] - v - typical);
    if (i === n - 1) return Math.abs(v - vals[n - 2] - typical);
    return Math.abs(v - (vals[i - 1] + vals[i + 1]) / 2);
  });
  for (let i = 0; i < n; i++) {
    if (dev[i] <= limit) continue;
    // An endpoint has one neighbour, so it must clearly stand out from it.
    const peak = i === 0 ? dev[0] > dev[1] * 1.25 : i === n - 1 ? dev[i] > dev[i - 1] * 1.25 : dev[i] >= dev[i - 1] && dev[i] >= dev[i + 1];
    if (peak) out.add(i);
  }
  return out;
}

const COL_LABEL = { liquid: "correction liquide", gas: "coefficient gaz" } as const;

/** Checks a table before it is used. Errors carry the 1-based row number. */
export function validateTable(rows: readonly CorrectionRow[]): TableError[] {
  const errors: TableError[] = [];
  if (rows.length < 2) errors.push({ row: 0, message: "La table doit contenir au moins 2 lignes." });

  rows.forEach((r, i) => {
    for (const col of ["t", "liquid", "gas"] as const) {
      if (!Number.isFinite(r[col])) {
        const column = col === "t" ? "temperature" : col;
        errors.push({ row: i + 1, column, message: `Valeur non numérique (${col === "t" ? "température" : COL_LABEL[col]}).` });
      }
    }
  });
  if (errors.length) return errors;

  // Temperatures: exact 0.1 steps, strictly ascending, no gap or duplicate.
  rows.forEach((r, i) => {
    if (Math.abs(r.t * 10 - tenths(r.t)) > 1e-6) errors.push({ row: i + 1, column: "temperature", message: `Température ${r.t} °C : pas un multiple de 0,1 °C.` });
    if (i === 0) return;
    const d = tenths(r.t) - tenths(rows[i - 1].t);
    if (d === 0) errors.push({ row: i + 1, column: "temperature", message: `Température ${fmtTemp(r.t)} °C en double.` });
    else if (d < 0) errors.push({ row: i + 1, column: "temperature", message: `Températures non croissantes : ${fmtTemp(r.t)} °C après ${fmtTemp(rows[i - 1].t)} °C.` });
    else if (d > 1) errors.push({ row: i + 1, column: "temperature", message: `Lacune : ${fmtTemp(rows[i - 1].t)} °C puis ${fmtTemp(r.t)} °C (pas de 0,1 °C attendu).` });
  });

  for (const col of ["liquid", "gas"] as const) {
    const vals = rows.map((r) => r[col]);
    const bad = outliers(vals);
    for (const i of bad) {
      errors.push({ row: i + 1, column: col, message: `Valeur aberrante pour le ${COL_LABEL[col]} : ${vals[i]} à ${fmtTemp(rows[i].t)} °C (décimale mal placée ?).` });
    }
    for (let i = 1; i < vals.length; i++) {
      if (bad.has(i) || bad.has(i - 1)) continue; // already reported as an outlier
      const d = vals[i] - vals[i - 1];
      if (col === "liquid" && d < -EPS)
        errors.push({ row: i + 1, column: col, message: `La correction liquide diminue à ${fmtTemp(rows[i].t)} °C (${vals[i]} après ${vals[i - 1]}) ; elle doit croître avec la température.` });
      if (col === "gas" && d > EPS)
        errors.push({ row: i + 1, column: col, message: `Le coefficient gaz augmente à ${fmtTemp(rows[i].t)} °C (${vals[i]} après ${vals[i - 1]}) ; il doit décroître avec la température.` });
    }
  }
  return errors.sort((a, b) => a.row - b.row);
}
