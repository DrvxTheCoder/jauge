import { describe, expect, it } from "vitest";
import { buildClosing, ecartBand, liveTankOutcomes, summarize } from "../lib/calc";
import { editProfile } from "../lib/correction";
import { DEFAULT_CONFIG, generateInventories } from "../lib/seed";
import type { TenantConfig } from "../lib/types";

const TODAY = new Date(2026, 9, 9);
const invs = generateInventories(DEFAULT_CONFIG, TODAY);
const centre = (id: string) => DEFAULT_CONFIG.centres.find((c) => c.id === id)!;

describe("closing snapshot", () => {
  it("editing a profile after closing does not change the inventory's summary", () => {
    const inv = invs.find((i) => i.status === "TERMINE")!;
    const c = centre(inv.centreId);
    expect(inv.closing).toBeDefined();
    const before = summarize(inv, c, DEFAULT_CONFIG);

    const edited: TenantConfig = {
      ...DEFAULT_CONFIG,
      correction: {
        ...DEFAULT_CONFIG.correction,
        profiles: DEFAULT_CONFIG.correction.profiles.map((p) =>
          p.id === DEFAULT_CONFIG.correction.defaultProfileId ? editProfile(p, { liquid: { method: "LINEAR", alpha: 0.004 }, stockBasis: "TOTAL" }) : p,
        ),
      },
    };
    const after = summarize(inv, c, edited);
    expect(after.stockPhys).toBe(before.stockPhys);
    expect(after.ecartPct).toBe(before.ecartPct);
    expect(after.frozen).toBe(true);

    // Without the snapshot the same readings would give another stock.
    const live = summarize({ ...inv, closing: undefined }, c, edited);
    expect(Math.abs(live.stockPhys - before.stockPhys)).toBeGreaterThan(1);
  });

  it("records the profile and version used", () => {
    const inv = invs.find((i) => i.status === "TERMINE")!;
    const p = DEFAULT_CONFIG.correction.profiles[0];
    const edited = { ...DEFAULT_CONFIG, correction: { ...DEFAULT_CONFIG.correction, profiles: [editProfile(p, { name: "Renommé" }), ...DEFAULT_CONFIG.correction.profiles.slice(1)] } };
    const closing = buildClosing(inv, centre(inv.centreId), edited);
    expect(closing.profileId).toBe(p.id);
    expect(closing.profileVersion).toBe(p.version + 1);
    for (const t of Object.values(closing.tanks)) expect(t.profileVersion).toBe(p.version + 1);
  });
});

describe("demo data", () => {
  // The demo is generated from "today", so check a few different todays.
  const sample = [TODAY, new Date(2026, 2, 1), new Date(2027, 5, 15)].flatMap((d) => generateInventories(DEFAULT_CONFIG, d));

  it("every tank reading is inside the table, without warnings, and below capacity", () => {
    let count = 0;
    for (const inv of sample) {
      const c = centre(inv.centreId);
      const outcomes = liveTankOutcomes(inv, c, DEFAULT_CONFIG);
      for (const res of c.reservoirs) {
        const o = outcomes[res.id];
        expect(o, `${inv.id} ${res.id}`).toBeDefined();
        expect(o.warnings, `${inv.id} ${res.id}`).toEqual([]);
        if (o.blocked) throw new Error(`${inv.id} ${res.id} blocked`);
        expect(o.liquidT, `${inv.id} ${res.id}`).toBeLessThan(res.capacityT);
        count++;
      }
      if (inv.status === "TERMINE") expect(inv.closing?.warnings).toEqual([]);
      else expect(inv.closing).toBeUndefined();
    }
    expect(count).toBeGreaterThan(500);
  });

  it("capacities match a full-tank density of 0.54–0.57 t/m³", () => {
    for (const c of DEFAULT_CONFIG.centres)
      for (const r of c.reservoirs) {
        const d = r.capacityT / r.capacityM3;
        expect(d).toBeGreaterThanOrEqual(0.54);
        expect(d).toBeLessThanOrEqual(0.57);
      }
  });

  it("écart bands stay plausible: mostly ok, some warn, rare alert", () => {
    const closed = sample.filter((i) => i.status === "TERMINE");
    const n = { ok: 0, warn: 0, alert: 0 };
    for (const i of closed) n[ecartBand(summarize(i, centre(i.centreId), DEFAULT_CONFIG).ecartPct, DEFAULT_CONFIG.rules)]++;
    expect(n.ok / closed.length).toBeGreaterThan(0.8);
    expect(n.warn).toBeGreaterThan(0);
    expect(n.alert / closed.length).toBeLessThan(0.04);
  });

  it("the demo tenant ships two profiles, the standard table by default", () => {
    const { profiles, defaultProfileId } = DEFAULT_CONFIG.correction;
    expect(profiles.map((p) => [p.liquid.method, p.gas.method])).toEqual([
      ["ADDITIVE_TABLE", "COEFFICIENT_TABLE"],
      ["LINEAR", "IDEAL_GAS"],
    ]);
    expect(defaultProfileId).toBe(profiles[0].id);
    expect(JSON.stringify(DEFAULT_CONFIG)).not.toMatch(/ASTM|API/);
  });
});
