import { checkCorrection } from "./correction";
import { DEFAULT_CONFIG } from "./seed";
import type { BottleType, Branding, CalcMode, Centre, FlowField, ProductionLine, Reservoir, Rules, TankType, TenantConfig } from "./types";

/* Tenant configuration as untrusted data: the JSON "template" files and what
   localStorage hands back. Everything is checked before it reaches the store. */

export const STORAGE_VERSION = 2;
export const TEMPLATE_FORMAT = "jauge-tenant-config";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

class Checker {
  errors: string[] = [];
  fail(at: string, msg: string) {
    this.errors.push(`${at} : ${msg}`);
  }
  str(o: Obj, k: string, at: string): string {
    if (isStr(o[k])) return o[k];
    this.fail(at, `« ${k} » texte attendu.`);
    return "";
  }
  num(o: Obj, k: string, at: string): number {
    if (isNum(o[k])) return o[k];
    this.fail(at, `« ${k} » nombre attendu.`);
    return 0;
  }
  list<T>(v: unknown, at: string, each: (x: Obj, at: string) => T): T[] {
    if (!Array.isArray(v)) {
      this.fail(at, "liste attendue.");
      return [];
    }
    return v.flatMap((x, i) => {
      if (isObj(x)) return [each(x, `${at} ${i + 1}`)];
      this.fail(`${at} ${i + 1}`, "objet attendu.");
      return [];
    });
  }
  oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[], at: string): T {
    const v = o[k];
    const hit = allowed.find((a) => a === v);
    if (hit) return hit;
    this.fail(at, `« ${k} » doit valoir ${allowed.join(" ou ")}.`);
    return allowed[0];
  }
}

const TANK_TYPES: readonly TankType[] = ["SPHERE", "CIGARE", "AUTRE"];
const CALC_MODES: readonly CalcMode[] = ["AUTOMATIC", "PERCENTAGE"];

/** Full structural check. Returns the typed config only when there is no error. */
export function checkTenantConfig(raw: unknown): { value: TenantConfig | null; errors: string[] } {
  const c = new Checker();
  if (!isObj(raw)) return { value: null, errors: ["La configuration doit être un objet JSON."] };

  const b = isObj(raw.branding) ? raw.branding : (c.fail("Marque", "objet attendu."), {});
  const branding: Branding = { companyName: c.str(b, "companyName", "Marque"), shortName: c.str(b, "shortName", "Marque"), brand: c.str(b, "brand", "Marque") };
  if (branding.brand && !/^#[0-9a-f]{6}$/i.test(branding.brand)) c.fail("Marque", "couleur hexadécimale #rrggbb attendue.");

  const r = isObj(raw.rules) ? raw.rules : (c.fail("Règles", "objet attendu."), {});
  const rules: Rules = {
    ecartOk: c.num(r, "ecartOk", "Règles"),
    ecartWarn: c.num(r, "ecartWarn", "Règles"),
    lunchBreakMin: c.num(r, "lunchBreakMin", "Règles"),
    stopTypes: isStrList(r.stopTypes) ? r.stopTypes : (c.fail("Règles", "« stopTypes » liste de textes attendue."), []),
  };

  const bottleTypes = c.list<BottleType>(raw.bottleTypes, "Bouteille", (x, at) => ({ id: c.str(x, "id", at), label: c.str(x, "label", at), kg: c.num(x, "kg", at) }));
  if (!bottleTypes.length) c.fail("Bouteilles", "au moins un format est requis.");

  const correction = checkCorrection(raw.correction);
  c.errors.push(...correction.errors);
  const profileIds = correction.value?.profiles.map((p) => p.id) ?? [];

  const field = (x: Obj, at: string): FlowField => ({ id: c.str(x, "id", at), label: c.str(x, "label", at) });
  const centres = c.list<Centre>(raw.centres, "Centre", (x, at) => {
    const name = isStr(x.name) ? `${at} « ${x.name} »` : at;
    return {
      id: c.str(x, "id", name),
      code: c.str(x, "code", name),
      name: c.str(x, "name", name),
      address: c.str(x, "address", name),
      managers: isStrList(x.managers) ? x.managers : (c.fail(name, "« managers » liste de textes attendue."), []),
      lines: c.list<ProductionLine>(x.lines, `${name}, ligne`, (l, a) => ({ id: c.str(l, "id", a), name: c.str(l, "name", a), capacityTph: c.num(l, "capacityTph", a) })),
      reservoirs: c.list<Reservoir>(x.reservoirs, `${name}, réservoir`, (t, a) => {
        const res: Reservoir = {
          id: c.str(t, "id", a),
          name: c.str(t, "name", a),
          type: c.oneOf(t, "type", TANK_TYPES, a),
          capacityM3: c.num(t, "capacityM3", a),
          capacityT: c.num(t, "capacityT", a),
          heightMm: c.num(t, "heightMm", a),
          calcMode: c.oneOf(t, "calcMode", CALC_MODES, a),
        };
        if (t.profileId !== undefined) {
          if (isStr(t.profileId) && profileIds.includes(t.profileId)) res.profileId = t.profileId;
          else if (correction.value) c.fail(a, `profil de correction « ${String(t.profileId)} » inconnu.`);
        }
        return res;
      }),
      approFields: c.list(x.approFields, `${name}, entrée`, field),
      sortieFields: c.list(x.sortieFields, `${name}, sortie`, field),
    };
  });
  if (!centres.length) c.fail("Centres", "au moins un centre est requis.");

  if (c.errors.length || !correction.value) return { value: null, errors: c.errors };
  return { value: { branding, rules, bottleTypes, centres, correction: correction.value }, errors: [] };
}

/* ---------------- template files ---------------- */

export function exportTenantJson(cfg: TenantConfig): string {
  return JSON.stringify({ format: TEMPLATE_FORMAT, version: STORAGE_VERSION, exportedAt: new Date().toISOString(), config: cfg }, null, 2);
}

export function parseTenantJson(text: string): { value: TenantConfig | null; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { value: null, errors: ["Le fichier n'est pas un JSON valide."] };
  }
  if (!isObj(raw) || raw.format !== TEMPLATE_FORMAT) return { value: null, errors: [`Format inconnu : un modèle exporté par l'application est attendu (« format »: « ${TEMPLATE_FORMAT} »).`] };
  if (raw.version !== STORAGE_VERSION) return { value: null, errors: [`Version de modèle ${String(raw.version)} non prise en charge (attendue : ${STORAGE_VERSION}).`] };
  return checkTenantConfig(raw.config);
}

/* ---------------- localStorage ---------------- */

/** v1 stored the bare config, with a `rules.correctionTable` label and no profiles. */
function fromV1(raw: Obj): Obj {
  const rules: Obj = { ...DEFAULT_CONFIG.rules, ...(isObj(raw.rules) ? raw.rules : {}) };
  delete rules.correctionTable;
  return { ...DEFAULT_CONFIG, ...raw, rules, correction: DEFAULT_CONFIG.correction };
}

export const storedConfig = (cfg: TenantConfig) => JSON.stringify({ version: STORAGE_VERSION, config: cfg });

/**
 * Reads whatever was persisted, migrating older versions. Never throws: anything
 * unreadable falls back to the demo configuration, with a notice for the user.
 */
export function migrateStoredConfig(text: string | null): { config: TenantConfig; migrated: boolean; notice: string | null } {
  if (text == null) return { config: DEFAULT_CONFIG, migrated: false, notice: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { config: DEFAULT_CONFIG, migrated: true, notice: "Configuration enregistrée illisible : configuration de démonstration restaurée." };
  }
  if (!isObj(raw)) return { config: DEFAULT_CONFIG, migrated: true, notice: "Configuration enregistrée illisible : configuration de démonstration restaurée." };

  const current = raw.version === STORAGE_VERSION;
  const candidate = current ? raw.config : fromV1(raw);
  const checked = checkTenantConfig(candidate);
  if (checked.value) return { config: checked.value, migrated: !current, notice: null };

  // Keep the rest of the tenant's settings if only the correction part is broken.
  if (isObj(candidate)) {
    const repaired = checkTenantConfig({
      ...candidate,
      correction: DEFAULT_CONFIG.correction,
      centres: Array.isArray(candidate.centres)
        ? candidate.centres.map((x) => (isObj(x) && Array.isArray(x.reservoirs) ? { ...x, reservoirs: x.reservoirs.map((t) => (isObj(t) ? { ...t, profileId: undefined } : t)) } : x))
        : candidate.centres,
    });
    if (repaired.value)
      return { config: repaired.value, migrated: true, notice: "Profils de correction enregistrés invalides : profils de démonstration restaurés." };
  }
  if (typeof console !== "undefined") console.warn("Stored config rejected", checked.errors);
  return { config: DEFAULT_CONFIG, migrated: true, notice: "Configuration enregistrée invalide : configuration de démonstration restaurée." };
}
