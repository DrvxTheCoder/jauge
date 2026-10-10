import { describe, expect, it } from "vitest";
import { fillToHeightRatio, heightToFillRatio, levelTone, type LevelModel } from "../lib/tankLevel";

const MODELS: LevelModel[] = ["sphere", "horizontal-cylinder"];

describe.each(MODELS)("fillToHeightRatio (%s)", (model) => {
  it("maps the ends and the middle", () => {
    expect(fillToHeightRatio(model, 0)).toBe(0);
    expect(fillToHeightRatio(model, 1)).toBe(1);
    expect(fillToHeightRatio(model, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("clamps out-of-range and invalid input", () => {
    expect(fillToHeightRatio(model, -0.2)).toBe(0);
    expect(fillToHeightRatio(model, 1.4)).toBe(1);
    expect(fillToHeightRatio(model, Number.NaN)).toBe(0);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const h = fillToHeightRatio(model, i / 100);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });

  it("round-trips through the volume curve", () => {
    for (const f of [0.01, 0.05, 0.3, 0.552, 0.9, 0.99]) {
      expect(heightToFillRatio(model, fillToHeightRatio(model, f))).toBeCloseTo(f, 6);
    }
  });

  it("is symmetric around the middle", () => {
    for (const f of [0.1, 0.3, 0.45]) {
      expect(fillToHeightRatio(model, f) + fillToHeightRatio(model, 1 - f)).toBeCloseTo(1, 6);
    }
  });
});

describe("fillToHeightRatio values", () => {
  it("sphere at 55.2 % sits just above mid-height", () => {
    expect(fillToHeightRatio("sphere", 0.552)).toBeCloseTo(0.535, 3);
  });

  it("a low fill sits higher than its volume share in a sphere", () => {
    expect(fillToHeightRatio("sphere", 0.05)).toBeGreaterThan(0.05);
    expect(fillToHeightRatio("horizontal-cylinder", 0.05)).toBeGreaterThan(0.05);
  });
});

describe("levelTone", () => {
  it("follows the dashboard bar thresholds", () => {
    expect(levelTone(5)).toBe("alert");
    expect(levelTone(15)).toBe("ok");
    expect(levelTone(55)).toBe("ok");
    expect(levelTone(90)).toBe("ok");
    expect(levelTone(95)).toBe("warn");
  });
});
