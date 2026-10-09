import type { CorrectionProfile, Reservoir, TankOutcome, TankReading, TenantConfig } from "../types";
import { fmtTemp, lookupRow, roundT, tableRange } from "./table";

/* ------------------------------------------------------------------
   Tank tonnage, reproducing the legacy sheets exactly:
     ambientDensity = d15 − liquidCorrection(tLiq)        (additive, t/m³)
     liquidT        = volLiqM3 × ambientDensity
     gasT           = (capacityM3 − volLiqM3) × gasCoefficient(tVap) × (pressureBar + offset)
     totalT         = liquidT + gasT
   Temperatures are rounded to tenths and read on the exact row, with no
   interpolation and no intermediate rounding.
   ------------------------------------------------------------------ */

const R = 8.314462; // J/(mol·K)
const ATM_BAR = 1.01325; // gauge → absolute for the ideal-gas method

export interface FactorLookup {
  value: number;
  /** Temperature actually read (the boundary row when clamped). */
  tUsed: number;
  clamped: "below" | "above" | null;
}

/** Liquid correction in t/m³ (what is subtracted from d15). Null when the table has no usable row. */
export function liquidCorrection(profile: CorrectionProfile, d15: number, tLiq: number): FactorLookup | null {
  if (profile.liquid.method === "LINEAR") {
    const t = roundT(tLiq);
    return { value: d15 * profile.liquid.alpha * (t - 15), tUsed: t, clamped: null };
  }
  const hit = lookupRow(profile.rows, tLiq);
  return hit && { value: hit.row.liquid, tUsed: hit.row.t, clamped: hit.clamped };
}

/** Gas density in t/m³ at 1 bar absolute and `tVap`. Null when the table has no usable row. */
export function gasCoefficient(profile: CorrectionProfile, tVap: number): FactorLookup | null {
  if (profile.gas.method === "IDEAL_GAS") {
    const t = roundT(tVap);
    return { value: (1e5 * profile.gas.molarMassKgMol) / (R * (t + 273.15)) / 1000, tUsed: t, clamped: null };
  }
  const hit = lookupRow(profile.rows, tVap);
  return hit && { value: hit.row.gas, tUsed: hit.row.t, clamped: hit.clamped };
}

/** Bar added to the gauge pressure: the profile's offset for a table, 1 atm for the ideal gas. */
export const pressureOffset = (profile: CorrectionProfile) => (profile.gas.method === "COEFFICIENT_TABLE" ? profile.gas.pressureOffsetBar : ATM_BAR);

function densityFrom(profile: CorrectionProfile, d15: number, liq: FactorLookup) {
  return profile.liquid.method === "LINEAR" ? d15 * (1 - profile.liquid.alpha * (liq.tUsed - 15)) : d15 - liq.value;
}

/**
 * Liquid density at ambient temperature, t/m³. Outside the table this reads the
 * boundary row; use tankResult for anything shown to a user, it applies the
 * out-of-range policy and reports it.
 */
export function ambientDensity(profile: CorrectionProfile, d15: number, tLiq: number): number {
  const liq = liquidCorrection(profile, d15, tLiq);
  return liq ? densityFrom(profile, d15, liq) : NaN;
}

const vapourVolume = (res: Pick<Reservoir, "capacityM3">, r: Pick<TankReading, "volLiqM3">) => Math.max(res.capacityM3 - r.volLiqM3, 0);

/** Gas mass in tonnes. Same boundary-row caveat as ambientDensity. */
export function gasMass(profile: CorrectionProfile, res: Pick<Reservoir, "capacityM3">, r: Pick<TankReading, "volLiqM3" | "tVap" | "pressureBar">): number {
  const gas = gasCoefficient(profile, r.tVap);
  return gas ? vapourVolume(res, r) * gas.value * (r.pressureBar + pressureOffset(profile)) : NaN;
}

function rangeText(profile: CorrectionProfile) {
  const range = tableRange(profile.rows);
  return range ? `${fmtTemp(range[0])}–${fmtTemp(range[1])} °C` : "";
}

/** Full result for one tank, with every fallback reported in `warnings`. */
export function tankResult(r: TankReading, res: Reservoir, profile: CorrectionProfile): TankOutcome {
  const warnings: string[] = [];
  const block = profile.outOfRange === "BLOCK";
  let blocked = false;

  const check = (what: string, t: number, hit: FactorLookup | null) => {
    if (!hit) {
      blocked = true;
      warnings.push(`${what} ${fmtTemp(t)} °C : la table « ${profile.name} » n'a pas de ligne utilisable. Aucun résultat.`);
    } else if (hit.clamped) {
      const where = hit.clamped === "below" ? "sous" : "au-dessus de";
      if (block) {
        blocked = true;
        warnings.push(`${what} ${fmtTemp(t)} °C ${where} la table (${rangeText(profile)}) : aucun résultat, la politique hors table est « bloquer ».`);
      } else warnings.push(`${what} ${fmtTemp(t)} °C ${where} la table (${rangeText(profile)}) : ligne ${fmtTemp(hit.tUsed)} °C utilisée.`);
    }
  };

  const liq = liquidCorrection(profile, r.d15, r.tLiq);
  const gas = gasCoefficient(profile, r.tVap);
  check("Température liquide", r.tLiq, liq);
  check("Température vapeur", r.tVap, gas);

  if (profile.d15Range) {
    const [lo, hi] = profile.d15Range;
    if (r.d15 < lo || r.d15 > hi) warnings.push(`Densité à 15 °C ${r.d15} hors de la plage de validité du profil (${lo}–${hi}).`);
  }
  if (r.volLiqM3 > res.capacityM3)
    warnings.push(`Volume liquide ${r.volLiqM3} m³ supérieur à la capacité ${res.capacityM3} m³ : volume gazeux compté à 0.`);

  const ids = { profileId: profile.id, profileVersion: profile.version };
  if (blocked || !liq || !gas) return { blocked: true, ...ids, warnings };

  const densAmb = densityFrom(profile, r.d15, liq);
  const liquidT = r.volLiqM3 * densAmb;
  const gasT = vapourVolume(res, r) * gas.value * (r.pressureBar + pressureOffset(profile));
  const totalT = liquidT + gasT;
  return {
    blocked: false,
    ...ids,
    liquidFactor: liq.value,
    gasCoefficient: gas.value,
    vcf: r.d15 ? densAmb / r.d15 : 0,
    vapFactor: gas.value * (r.pressureBar + pressureOffset(profile)),
    densAmb,
    liquidT,
    gasT,
    totalT,
    stockT: profile.stockBasis === "TOTAL" ? totalT : liquidT,
    fillPct: res.capacityT ? (liquidT / res.capacityT) * 100 : 0,
    warnings,
  };
}

/** Profile for a tank: its override if set and present, else the tenant default. */
export function profileFor(cfg: Pick<TenantConfig, "correction">, res: Pick<Reservoir, "profileId">): CorrectionProfile {
  const { profiles, defaultProfileId } = cfg.correction;
  return (
    (res.profileId && profiles.find((p) => p.id === res.profileId)) ||
    profiles.find((p) => p.id === defaultProfileId) ||
    profiles[0]
  );
}

/** Message when a tank's override points to a profile that no longer exists, so the fallback is visible. */
export function profileFallbackWarning(cfg: Pick<TenantConfig, "correction">, res: Pick<Reservoir, "profileId">): string | null {
  if (!res.profileId || cfg.correction.profiles.some((p) => p.id === res.profileId)) return null;
  return `Profil de correction « ${res.profileId} » introuvable : profil par défaut « ${profileFor(cfg, {}).name} » utilisé.`;
}
