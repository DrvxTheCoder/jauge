import type { CorrectionConfig, CorrectionProfile, CorrectionRow, GasMethod, LiquidMethod } from "../types";
import { DEFAULT_TABLE_ROWS } from "./default-table";
import { validateTable } from "./table";

export const BUILTIN_PROFILE_ID = "butane-standard-15-36";

/** The built-in default: the standard butane table shipped in lib/data/correction. */
export function builtinProfile(): CorrectionProfile {
  return {
    id: BUILTIN_PROFILE_ID,
    name: "Butane — table standard 15–36 °C",
    version: 1,
    product: "Butane commercial",
    source: "[À COMPLÉTER] Référence normative exacte de la table : norme, édition, numéro du tableau.",
    liquid: { method: "ADDITIVE_TABLE" },
    gas: { method: "COEFFICIENT_TABLE", pressureOffsetBar: 1 },
    rows: DEFAULT_TABLE_ROWS.map((r) => ({ ...r })),
    outOfRange: "WARN",
    stockBasis: "LIQUID",
  };
}

/** Demo-only example, so switching methods can be shown. Not a normative table. */
export function linearExampleProfile(): CorrectionProfile {
  return {
    id: "lineaire-indicatif",
    name: "Linéaire indicatif",
    version: 1,
    product: "Butane commercial",
    source: "Exemple de démonstration : dilatation linéaire et loi des gaz parfaits, sans table normative.",
    liquid: { method: "LINEAR", alpha: 0.002 },
    gas: { method: "IDEAL_GAS", molarMassKgMol: 0.0581 },
    rows: [],
    outOfRange: "WARN",
    stockBasis: "LIQUID",
  };
}

export const usesTable = (p: Pick<CorrectionProfile, "liquid" | "gas">) => p.liquid.method === "ADDITIVE_TABLE" || p.gas.method === "COEFFICIENT_TABLE";

/** Applies an edit and bumps the version, so closed inventories can tell which revision they used. */
export const editProfile = (p: CorrectionProfile, patch: Partial<Omit<CorrectionProfile, "id" | "version">>): CorrectionProfile => ({
  ...p,
  ...patch,
  version: p.version + 1,
});

export function uniqueProfileId(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "profil";
  let id = base;
  for (let k = 2; taken.includes(id); k++) id = `${base}-${k}`;
  return id;
}

/* ---------------- validation of untrusted data (imports, storage) ---------------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

export interface Checked<T> {
  value: T | null;
  errors: string[];
}

function checkRows(raw: unknown, errors: string[], at: string): CorrectionRow[] {
  if (!Array.isArray(raw)) {
    errors.push(`${at} : « rows » doit être une liste.`);
    return [];
  }
  const rows: CorrectionRow[] = [];
  raw.forEach((r, i) => {
    if (isObj(r) && isNum(r.t) && isNum(r.liquid) && isNum(r.gas)) rows.push({ t: r.t, liquid: r.liquid, gas: r.gas });
    else errors.push(`${at}, ligne ${i + 1} : attendu { t, liquid, gas } numériques.`);
  });
  return rows;
}

export function checkProfile(raw: unknown, at = "Profil"): Checked<CorrectionProfile> {
  const errors: string[] = [];
  if (!isObj(raw)) return { value: null, errors: [`${at} : objet attendu.`] };
  const label = isStr(raw.name) && raw.name ? `${at} « ${raw.name} »` : at;

  if (!isStr(raw.id) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw.id)) errors.push(`${label} : identifiant manquant ou invalide (lettres, chiffres, - et _).`);
  if (!isStr(raw.name) || !raw.name.trim()) errors.push(`${label} : nom manquant.`);
  if (!isNum(raw.version) || raw.version < 1 || !Number.isInteger(raw.version)) errors.push(`${label} : version entière ≥ 1 attendue.`);
  if (!isStr(raw.product)) errors.push(`${label} : produit manquant.`);
  if (!isStr(raw.source)) errors.push(`${label} : source manquante.`);

  let d15Range: [number, number] | undefined;
  if (raw.d15Range !== undefined) {
    const d = raw.d15Range;
    if (Array.isArray(d) && d.length === 2 && isNum(d[0]) && isNum(d[1]) && d[0] < d[1]) d15Range = [d[0], d[1]];
    else errors.push(`${label} : d15Range doit être [min, max] avec min < max.`);
  }

  let liquid: LiquidMethod | null = null;
  const l = raw.liquid;
  if (isObj(l) && l.method === "ADDITIVE_TABLE") liquid = { method: "ADDITIVE_TABLE" };
  else if (isObj(l) && l.method === "LINEAR" && isNum(l.alpha) && l.alpha > 0) liquid = { method: "LINEAR", alpha: l.alpha };
  else errors.push(`${label} : méthode liquide invalide (ADDITIVE_TABLE, ou LINEAR avec alpha > 0).`);

  let gas: GasMethod | null = null;
  const g = raw.gas;
  if (isObj(g) && g.method === "COEFFICIENT_TABLE" && isNum(g.pressureOffsetBar) && g.pressureOffsetBar >= 0)
    gas = { method: "COEFFICIENT_TABLE", pressureOffsetBar: g.pressureOffsetBar };
  else if (isObj(g) && g.method === "IDEAL_GAS" && isNum(g.molarMassKgMol) && g.molarMassKgMol > 0) gas = { method: "IDEAL_GAS", molarMassKgMol: g.molarMassKgMol };
  else errors.push(`${label} : méthode gaz invalide (COEFFICIENT_TABLE avec pressureOffsetBar ≥ 0, ou IDEAL_GAS avec molarMassKgMol > 0).`);

  if (raw.outOfRange !== "WARN" && raw.outOfRange !== "BLOCK") errors.push(`${label} : outOfRange doit valoir WARN ou BLOCK.`);
  if (raw.stockBasis !== "LIQUID" && raw.stockBasis !== "TOTAL") errors.push(`${label} : stockBasis doit valoir LIQUID ou TOTAL.`);

  const rows = checkRows(raw.rows ?? [], errors, label);
  const needsTable = liquid?.method === "ADDITIVE_TABLE" || gas?.method === "COEFFICIENT_TABLE";
  if (rows.length || needsTable) {
    for (const e of validateTable(rows)) errors.push(`${label}, ${e.row ? `ligne ${e.row}` : "table"} : ${e.message}`);
  }

  if (errors.length || !liquid || !gas) return { value: null, errors };
  return {
    value: {
      id: String(raw.id),
      name: String(raw.name),
      version: Number(raw.version),
      product: String(raw.product),
      source: String(raw.source),
      ...(d15Range ? { d15Range } : {}),
      liquid,
      gas,
      rows,
      outOfRange: raw.outOfRange === "BLOCK" ? "BLOCK" : "WARN",
      stockBasis: raw.stockBasis === "TOTAL" ? "TOTAL" : "LIQUID",
    },
    errors,
  };
}

export function checkCorrection(raw: unknown): Checked<CorrectionConfig> {
  if (!isObj(raw) || !Array.isArray(raw.profiles)) return { value: null, errors: ["Correction : { profiles, defaultProfileId } attendu."] };
  const errors: string[] = [];
  const profiles: CorrectionProfile[] = [];
  raw.profiles.forEach((p, i) => {
    const c = checkProfile(p, `Profil ${i + 1}`);
    errors.push(...c.errors);
    if (c.value) profiles.push(c.value);
  });
  if (!raw.profiles.length) errors.push("Correction : au moins un profil est requis.");
  const ids = profiles.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) errors.push(`Correction : identifiant de profil « ${dup} » en double.`);
  if (!isStr(raw.defaultProfileId) || !ids.includes(raw.defaultProfileId)) errors.push("Correction : le profil par défaut n'existe pas.");
  if (errors.length) return { value: null, errors };
  return { value: { profiles, defaultProfileId: String(raw.defaultProfileId) }, errors };
}
