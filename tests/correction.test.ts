import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ambientDensity,
  builtinProfile,
  DEFAULT_TABLE_ROWS,
  gasCoefficient,
  gasMass,
  liquidCorrection,
  lookupRow,
  parseCorrectionCsv,
  tankResult,
  toCorrectionCsv,
  validateTable,
} from "../lib/correction";
import type { CorrectionProfile, CorrectionRow, Reservoir, TankReading, TankResult } from "../lib/types";

const TOL = 1e-6;
const tank = (capacityM3: number): Reservoir => ({ id: "t", name: "T", type: "SPHERE", capacityM3, capacityT: capacityM3, heightMm: 1000, calcMode: "AUTOMATIC" });
const reading = (tLiq: number, tVap: number, pressureBar: number, d15: number, volLiqM3: number): TankReading => ({ heightMm: 0, tLiq, tVap, pressureBar, d15, volLiqM3 });

function ok(o: ReturnType<typeof tankResult>): TankResult {
  if (o.blocked) throw new Error(`blocked: ${o.warnings.join(" | ")}`);
  return o;
}

describe("golden vectors, default profile", () => {
  const p = builtinProfile();
  const cases = [
    { in: [25.0, 26.0, 2.0, 0.575, 500, 600], liq: 0.0116, gas: 0.002341, dens: 0.5634, liquidT: 281.7, gasT: 0.7023, totalT: 282.4023 },
    { in: [30.0, 31.0, 3.0, 0.57, 250, 300], liq: 0.0174, gas: 0.002294, dens: 0.5526, liquidT: 138.15, gasT: 0.4588, totalT: 138.6088 },
    { in: [15.0, 15.0, 1.0, 0.58, 100, 120], liq: 0, gas: 0.002449, dens: 0.58, liquidT: 58.0, gasT: 0.09796, totalT: 58.09796 },
  ];
  for (const c of cases) {
    it(`tLiq ${c.in[0]}, tVap ${c.in[1]}`, () => {
      const [tLiq, tVap, pBar, d15, vol, cap] = c.in;
      const r = reading(tLiq, tVap, pBar, d15, vol);
      const res = ok(tankResult(r, tank(cap), p));
      expect(res.liquidFactor).toBeCloseTo(c.liq, 10);
      expect(res.gasCoefficient).toBeCloseTo(c.gas, 10);
      expect(Math.abs(res.densAmb - c.dens)).toBeLessThan(TOL);
      expect(Math.abs(res.liquidT - c.liquidT)).toBeLessThan(TOL);
      expect(Math.abs(res.gasT - c.gasT)).toBeLessThan(TOL);
      expect(Math.abs(res.totalT - c.totalT)).toBeLessThan(TOL);
      expect(res.warnings).toEqual([]);
      expect(res.stockT).toBe(res.liquidT); // stockBasis LIQUID
      // The standalone helpers agree with tankResult.
      expect(ambientDensity(p, d15, tLiq)).toBe(res.densAmb);
      expect(gasMass(p, tank(cap), r)).toBe(res.gasT);
    });
  }

  it("LINEAR alpha 0.0020 on the first vector", () => {
    const lin: CorrectionProfile = { ...p, liquid: { method: "LINEAR", alpha: 0.002 } };
    const res = ok(tankResult(reading(25, 26, 2, 0.575, 500), tank(600), lin));
    expect(Math.abs(res.densAmb - 0.5635)).toBeLessThan(TOL);
    expect(Math.abs(res.liquidT - 281.75)).toBeLessThan(TOL);
  });

  it("stockBasis TOTAL counts the gas too", () => {
    const res = ok(tankResult(reading(25, 26, 2, 0.575, 500), tank(600), { ...p, stockBasis: "TOTAL" }));
    expect(Math.abs(res.stockT - 282.4023)).toBeLessThan(TOL);
  });

  it("IDEAL_GAS gives a coefficient close to the table", () => {
    const ig: CorrectionProfile = { ...p, gas: { method: "IDEAL_GAS", molarMassKgMol: 0.0581 } };
    const g = gasCoefficient(ig, 26)!;
    expect(g.value).toBeGreaterThan(0.00230);
    expect(g.value).toBeLessThan(0.00238);
  });
});

describe("lookup rounding", () => {
  const p = builtinProfile();
  it("reads the row of the temperature rounded to tenths", () => {
    expect(liquidCorrection(p, 0.575, 25.04)!.tUsed).toBe(25.0);
    expect(liquidCorrection(p, 0.575, 25.06)!.tUsed).toBe(25.1);
    expect(liquidCorrection(p, 0.575, 25.1)!.value).toBe(0.0117);
    // 0.1 steps accumulated in floating point still land on their row.
    let t = 15;
    for (let i = 0; i < 100; i++) t += 0.1;
    expect(lookupRow(p.rows, t)!.row.t).toBe(25.0);
  });
  it("is deterministic", () => {
    const a = liquidCorrection(p, 0.575, 27.349);
    for (let i = 0; i < 50; i++) expect(liquidCorrection(p, 0.575, 27.349)).toEqual(a);
  });
});

describe("validateTable", () => {
  const base = (): CorrectionRow[] => DEFAULT_TABLE_ROWS.map((r) => ({ ...r }));
  const rowOf = (rows: CorrectionRow[], t: number) => rows.findIndex((r) => Math.round(r.t * 10) === Math.round(t * 10)) + 1;

  it("accepts the default table", () => {
    expect(validateTable(base())).toEqual([]);
  });

  it("pinpoints corrupted values with their row numbers", () => {
    const rows = base();
    const liquidAt = rowOf(rows, 22.0);
    const gasAt = [rowOf(rows, 18.4), rowOf(rows, 31.2)];
    rows[liquidAt - 1].liquid *= 3;
    for (const r of gasAt) rows[r - 1].gas *= 10;
    const errors = validateTable(rows);
    expect(errors.find((e) => e.row === liquidAt && e.column === "liquid")).toBeDefined();
    for (const r of gasAt) expect(errors.find((e) => e.row === r && e.column === "gas")).toBeDefined();
    // Nothing else is blamed.
    expect(new Set(errors.map((e) => e.row))).toEqual(new Set([liquidAt, ...gasAt]));
  });

  it("catches a corrupted first or last row", () => {
    const rows = base();
    rows[0].gas *= 10;
    rows[rows.length - 1].liquid /= 10;
    const errors = validateTable(rows);
    expect(errors.map((e) => e.row)).toEqual([1, rows.length]);
  });

  it("rejects a gap in temperatures", () => {
    const rows = base();
    rows.splice(50, 1);
    expect(validateTable(rows).some((e) => e.column === "temperature" && /Lacune/.test(e.message))).toBe(true);
  });

  it("rejects a duplicate temperature", () => {
    const rows = base();
    rows.splice(50, 0, { ...rows[50] });
    expect(validateTable(rows).some((e) => e.column === "temperature" && /double/.test(e.message))).toBe(true);
  });

  it("rejects a decreasing liquid column", () => {
    const rows = base();
    const liq = rows.map((r) => r.liquid).reverse();
    rows.forEach((r, i) => (r.liquid = liq[i]));
    expect(validateTable(rows).some((e) => e.column === "liquid")).toBe(true);
  });

  it("rejects fewer than 2 rows and non-numeric values", () => {
    expect(validateTable([{ t: 15, liquid: 0, gas: 0.0024 }]).length).toBeGreaterThan(0);
    expect(validateTable([{ t: 15, liquid: 0, gas: 0.0024 }, { t: 15.1, liquid: NaN, gas: 0.0024 }])[0].row).toBe(2);
  });
});

describe("out of range", () => {
  const warn = builtinProfile();
  const block: CorrectionProfile = { ...warn, outOfRange: "BLOCK" };
  for (const [label, tLiq, tVap] of [
    ["below 15.0 °C", 14.9, 16],
    ["above 36.0 °C", 36.1, 30],
    ["vapour above 36.0 °C", 30, 36.2],
  ] as const) {
    it(`${label}: WARN uses the boundary row and warns`, () => {
      const res = ok(tankResult(reading(tLiq, tVap, 2, 0.575, 100), tank(200), warn));
      expect(res.warnings.length).toBe(1);
      const boundary = tLiq < 15 ? 0 : tLiq > 36 ? 0.0242 : null;
      if (boundary !== null) expect(res.liquidFactor).toBe(boundary);
      else expect(res.gasCoefficient).toBe(0.002253);
    });
    it(`${label}: BLOCK gives no result`, () => {
      const res = tankResult(reading(tLiq, tVap, 2, 0.575, 100), tank(200), block);
      expect(res.blocked).toBe(true);
      expect(res.warnings.length).toBe(1);
    });
  }
  it("the table edges themselves are in range", () => {
    expect(ok(tankResult(reading(15.0, 36.0, 2, 0.575, 100), tank(200), block)).warnings).toEqual([]);
    expect(ok(tankResult(reading(36.04, 14.96, 2, 0.575, 100), tank(200), block)).warnings).toEqual([]);
  });
  it("d15 outside the profile's range warns", () => {
    const res = ok(tankResult(reading(25, 26, 2, 0.6, 100), tank(200), { ...warn, d15Range: [0.55, 0.59] }));
    expect(res.warnings.length).toBe(1);
  });
  it("a liquid volume above capacity is reported, not silently clamped", () => {
    const res = ok(tankResult(reading(25, 26, 2, 0.575, 250), tank(200), warn));
    expect(res.gasT).toBe(0);
    expect(res.warnings.length).toBe(1);
  });
});

describe("CSV", () => {
  const csvPath = join(__dirname, "../lib/data/correction/butane-standard-15-36.csv");
  const csv = readFileSync(csvPath, "utf8");

  it("the generated default table matches its CSV", () => {
    const parsed = parseCorrectionCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual(DEFAULT_TABLE_ROWS);
  });

  it("round-trips through export", () => {
    expect(parseCorrectionCsv(toCorrectionCsv(DEFAULT_TABLE_ROWS)).rows).toEqual(DEFAULT_TABLE_ROWS);
  });

  it("tolerates a BOM, CRLF, `;` and reordered columns", () => {
    const text = "﻿gas_coefficient;temperature;liquid_correction\r\n0.002449;15.0;0\r\n0.002448;15.1;0.0001\r\n";
    const parsed = parseCorrectionCsv(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { t: 15, liquid: 0, gas: 0.002449 },
      { t: 15.1, liquid: 0.0001, gas: 0.002448 },
    ]);
    expect(parsed.lineOf).toEqual([2, 3]);
  });

  it("reports bad lines with their line number", () => {
    const parsed = parseCorrectionCsv("temperature;liquid_correction;gas_coefficient\n15.0;0;0,002449\n15.1;abc;0.002448\n15.2;0.0002\n");
    expect(parsed.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(parsed.errors[0].message).toMatch(/point/);
  });

  it("requires the header", () => {
    expect(parseCorrectionCsv("15.0,0,0.002449\n15.1,0.0001,0.002448").errors[0].line).toBe(1);
  });
});
