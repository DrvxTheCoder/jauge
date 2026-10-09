import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../lib/seed";
import { exportTenantJson, migrateStoredConfig, parseTenantJson, storedConfig } from "../lib/tenant-io";

/** What v1 of the app persisted: the bare config, a correction label and no profiles. */
function legacyV1() {
  const { correction: _c, ...rest } = DEFAULT_CONFIG;
  void _c;
  return { ...rest, branding: { ...rest.branding, companyName: "Société Test" }, rules: { ...rest.rules, ecartOk: 1.5, correctionTable: "Table personnalisée" } };
}

describe("stored config migration", () => {
  it("injects the default profiles into a v1 config and drops correctionTable", () => {
    const m = migrateStoredConfig(JSON.stringify(legacyV1()));
    expect(m.migrated).toBe(true);
    expect(m.notice).toBeNull();
    expect(m.config.branding.companyName).toBe("Société Test");
    expect(m.config.rules.ecartOk).toBe(1.5);
    expect("correctionTable" in m.config.rules).toBe(false);
    expect(m.config.correction).toEqual(DEFAULT_CONFIG.correction);
  });

  it("reads the current format as is", () => {
    const m = migrateStoredConfig(storedConfig(DEFAULT_CONFIG));
    expect(m.migrated).toBe(false);
    expect(m.config).toEqual(DEFAULT_CONFIG);
  });

  it("never throws on garbage", () => {
    for (const raw of ["{", "null", "42", '"x"', "[]", '{"version":2,"config":7}', '{"centres":"nope"}']) {
      const m = migrateStoredConfig(raw);
      expect(m.config).toBeDefined();
      expect(m.notice).not.toBeNull();
    }
    expect(migrateStoredConfig(null).config).toBe(DEFAULT_CONFIG);
  });

  it("keeps the tenant's settings when only the profiles are broken", () => {
    const cfg = { ...DEFAULT_CONFIG, branding: { ...DEFAULT_CONFIG.branding, shortName: "XY" }, correction: { profiles: [{ id: "x" }], defaultProfileId: "x" } };
    const m = migrateStoredConfig(JSON.stringify({ version: 2, config: cfg }));
    expect(m.config.branding.shortName).toBe("XY");
    expect(m.config.correction).toEqual(DEFAULT_CONFIG.correction);
    expect(m.notice).toMatch(/Profils/);
  });
});

describe("tenant template files", () => {
  it("round-trips", () => {
    const parsed = parseTenantJson(exportTenantJson(DEFAULT_CONFIG));
    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(DEFAULT_CONFIG);
  });

  it("rejects a template whose profile table is invalid", () => {
    const bad = structuredClone(DEFAULT_CONFIG);
    bad.correction.profiles[0].rows[40].gas *= 10;
    const parsed = parseTenantJson(exportTenantJson(bad));
    expect(parsed.value).toBeNull();
    expect(parsed.errors.join("\n")).toMatch(/ligne 41/);
  });

  it("rejects an unknown per-tank profile and a missing default", () => {
    const bad = structuredClone(DEFAULT_CONFIG);
    bad.centres[0].reservoirs[0].profileId = "inconnu";
    bad.correction.defaultProfileId = "absent";
    const parsed = parseTenantJson(exportTenantJson(bad));
    expect(parsed.value).toBeNull();
    expect(parsed.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a profile id that is not a slug", () => {
    const bad = structuredClone(DEFAULT_CONFIG);
    bad.correction.profiles[1].id = 'a"b';
    expect(parseTenantJson(exportTenantJson(bad)).value).toBeNull();
  });

  it("rejects other JSON files", () => {
    expect(parseTenantJson("{}").value).toBeNull();
    expect(parseTenantJson("pas du json").value).toBeNull();
  });
});
