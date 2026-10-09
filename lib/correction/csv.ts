import type { CorrectionRow } from "../types";

/* CSV in and out for correction tables. Hand-written, no dependency.
   Columns (header required, any order): temperature,liquid_correction,gas_coefficient
   Decimal point only. Tolerates a BOM, CRLF, `;` as separator and quoted cells. */

export const CSV_COLUMNS = ["temperature", "liquid_correction", "gas_coefficient"] as const;

export interface CsvError {
  line: number; // 1-based line in the file
  message: string;
}

export interface ParsedCsv {
  rows: CorrectionRow[];
  /** Source line of each row, to report validation errors against the file. */
  lineOf: number[];
  errors: CsvError[];
}

const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

const unquote = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
};

export function parseCorrectionCsv(text: string): ParsedCsv {
  const out: ParsedCsv = { rows: [], lineOf: [], errors: [] };
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const headerAt = lines.findIndex((l) => l.trim() !== "");
  if (headerAt < 0) {
    out.errors.push({ line: 1, message: "Fichier vide." });
    return out;
  }

  const headerLine = lines[headerAt];
  const sep = headerLine.includes(";") ? ";" : ",";
  const header = headerLine.split(sep).map((h) => unquote(h).toLowerCase());
  const col = CSV_COLUMNS.map((c) => header.indexOf(c));
  if (col.some((i) => i < 0)) {
    const missing = CSV_COLUMNS.filter((_, k) => col[k] < 0).join(", ");
    out.errors.push({ line: headerAt + 1, message: `En-tête attendu : ${CSV_COLUMNS.join(",")}. Colonne(s) manquante(s) : ${missing}.` });
    return out;
  }

  for (let i = headerAt + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const line = i + 1;
    const cells = lines[i].split(sep).map(unquote);
    if (cells.length !== header.length) {
      out.errors.push({ line, message: `${cells.length} colonne(s) au lieu de ${header.length}.` });
      continue;
    }
    const vals = col.map((k) => cells[k]);
    const bad = vals.findIndex((v) => !NUMBER.test(v));
    if (bad >= 0) {
      const v = vals[bad];
      const hint = /^\s*[-+]?\d+,\d+\s*$/.test(v) ? " Utilisez le point comme séparateur décimal." : "";
      out.errors.push({ line, message: `${CSV_COLUMNS[bad]} : « ${v} » n'est pas un nombre.${hint}` });
      continue;
    }
    const [t, liquid, gas] = vals.map(Number);
    out.rows.push({ t, liquid, gas });
    out.lineOf.push(line);
  }
  if (!out.rows.length && !out.errors.length) out.errors.push({ line: headerAt + 2, message: "Aucune ligne de données." });
  return out;
}

export function toCorrectionCsv(rows: readonly CorrectionRow[]): string {
  const body = rows.map((r) => `${r.t.toFixed(1)},${r.liquid},${r.gas}`);
  return [CSV_COLUMNS.join(","), ...body].join("\n") + "\n";
}
