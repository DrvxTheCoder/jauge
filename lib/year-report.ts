import { aggregate, type Aggregate } from "./aggregate";
import { cap, fmt, fmtDate, fmtDuration } from "./format";
import { A4_LANDSCAPE, pdfDocument, type PdfPage, type PdfText, type Rgb } from "./pdf";
import { iso } from "./seed";
import type { Centre, Inventory, TenantConfig } from "./types";

/** Reports progress in [0, 1]; a background job turns it into the hub's ring. */
export type OnProgress = (p: number) => void;

export interface ReportFile {
  blob: Blob;
  filename: string;
}

// The aggregation itself takes milliseconds on demo data. Each step is paced
// so progress stays readable in the hub; drop this once a server builds it.
const STEP_MS = 550;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MONTH = (m: number) => cap(new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2026, m, 1)));

interface Row {
  label: string;
  a: Aggregate;
}

/**
 * Yearly report, every centre: one row per month, a total for the year,
 * then one row per centre. Built month by month so progress is real.
 */
export async function buildYearReport(opts: {
  inventories: Inventory[];
  config: TenantConfig;
  year: number;
  today?: Date;
  onProgress: OnProgress;
}): Promise<ReportFile> {
  const { inventories, config, year, onProgress } = opts;
  const today = opts.today ?? new Date();
  const centreOf = (id: string): Centre => config.centres.find((c) => c.id === id) ?? config.centres[0];
  const inYear = inventories.filter((i) => i.date.startsWith(`${year}-`));
  const lastMonth = year === today.getFullYear() ? today.getMonth() : 11;
  const steps = lastMonth + 1 + config.centres.length + 1;
  let done = 0;
  const tick = async () => {
    onProgress(++done / steps);
    await wait(STEP_MS);
  };

  onProgress(0);
  const months: Row[] = [];
  for (let m = 0; m <= lastMonth; m++) {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}-`;
    months.push({ label: MONTH(m), a: aggregate(inYear.filter((i) => i.date.startsWith(prefix)), config, centreOf) });
    await tick();
  }
  const total = aggregate(inYear, config, centreOf);

  const centres: Row[] = [];
  for (const c of config.centres) {
    centres.push({ label: c.name, a: aggregate(inYear.filter((i) => i.centreId === c.id), config, centreOf) });
    await tick();
  }

  const end = year === today.getFullYear() ? iso(today) : `${year}-12-31`;
  const blob = pdfDocument(layout({ config, year, end, months, total, centres }));
  onProgress(1);
  return { blob, filename: `rapport-annuel-${year}.pdf` };
}

/* ---------- Layout ---------- */

const INK: Rgb = [20, 28, 23];
const MUTED: Rgb = [104, 114, 108];
const LINE: Rgb = [226, 230, 227];
const ZEBRA: Rgb = [245, 247, 245];

function hexRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0) as Rgb;
}

const darken = (c: Rgb, k: number): Rgb => c.map((v) => Math.round(v * k)) as Rgb;

interface Col {
  label: string;
  w: number;
  cell: (r: Row) => string;
  left?: boolean;
}

const dash = (a: Aggregate, s: string) => (a.days ? s : "—");

const MONTH_COLS: Col[] = [
  { label: "Mois", w: 96, left: true, cell: (r) => r.label },
  { label: "Journées", w: 58, cell: (r) => String(r.a.days) },
  { label: "Conditionné (T)", w: 86, cell: (r) => dash(r.a, fmt(r.a.conditionneT, 1)) },
  { label: "Vrac (T)", w: 70, cell: (r) => dash(r.a, fmt(r.a.vracT, 1)) },
  { label: "Appro (T)", w: 70, cell: (r) => dash(r.a, fmt(r.a.approT, 1)) },
  { label: "Bouteilles", w: 72, cell: (r) => dash(r.a, fmt(r.a.bottlesN)) },
  { label: "Temps utile", w: 74, cell: (r) => dash(r.a, fmtDuration(r.a.utileMin)) },
  { label: "Arrêts", w: 66, cell: (r) => dash(r.a, fmtDuration(r.a.stopMin)) },
  { label: "Rendement (T/h)", w: 88, cell: (r) => dash(r.a, fmt(r.a.rendementTph, 2)) },
  { label: "Écart moyen (%)", w: 90, cell: (r) => dash(r.a, fmt(r.a.meanAbsEcart, 2)) },
];

const CENTRE_COLS: Col[] = [
  { label: "Centre", w: 96, left: true, cell: (r) => r.label },
  ...MONTH_COLS.slice(1),
];

const M = 36; // page margin
const ROW_H = 22;

function table(t: PdfPage, top: number, cols: Col[], rows: Row[], foot?: Row) {
  let x = M;
  const xs = cols.map((c) => {
    const at = x;
    x += c.w;
    return at;
  });
  const width = x - M;
  t.rects!.push({ x: M, y: top, w: width, h: ROW_H, color: ZEBRA });
  cols.forEach((c, i) =>
    t.texts.push({ x: c.left ? xs[i] + 8 : xs[i] + c.w - 8, y: top + 14.5, text: c.label, size: 8.5, bold: true, color: MUTED, align: c.left ? "left" : "right" }),
  );
  let y = top + ROW_H;
  const all = foot ? [...rows, foot] : rows;
  all.forEach((r, ri) => {
    const isFoot = foot && ri === all.length - 1;
    t.rects!.push({ x: M, y: y + ROW_H - 0.6, w: width, h: 0.6, color: LINE });
    if (isFoot) t.rects!.push({ x: M, y, w: width, h: ROW_H, color: ZEBRA });
    cols.forEach((c, i) =>
      t.texts.push({
        x: c.left ? xs[i] + 8 : xs[i] + c.w - 8,
        y: y + 14.5,
        text: c.cell(r),
        size: 9.5,
        bold: !!isFoot || i === 0,
        color: r.a.days || isFoot ? INK : MUTED,
        align: c.left ? "left" : "right",
      }),
    );
    y += ROW_H;
  });
  return y;
}

function layout(d: { config: TenantConfig; year: number; end: string; months: Row[]; total: Aggregate; centres: Row[] }): PdfPage[] {
  const { width } = A4_LANDSCAPE;
  const brand = darken(hexRgb(d.config.branding.brand), 0.55);
  const company = d.config.branding.companyName;
  const span = `Tous centres · du 1er janvier au ${fmtDate(d.end)}`;
  const generated = `Généré le ${fmtDate(iso(new Date()))}`;

  const page = (title: string, subtitle: string): PdfPage => ({
    rects: [{ x: 0, y: 0, w: width, h: 92, color: brand }],
    texts: [
      { x: M, y: 40, text: title, size: 20, bold: true, color: [255, 255, 255] },
      { x: M, y: 62, text: `${company} · ${subtitle}`, size: 10, color: [214, 226, 219] },
      { x: width - M, y: 40, text: String(d.year), size: 20, bold: true, color: [255, 255, 255], align: "right" },
      { x: width - M, y: 62, text: generated, size: 9, color: [214, 226, 219], align: "right" },
    ] as PdfText[],
  });

  const p1 = page(`Rapport annuel ${d.year}`, span);
  table(p1, 116, MONTH_COLS, d.months, { label: "Année", a: d.total });

  const p2 = page(`Rapport annuel ${d.year} · par centre`, span);
  const end = table(p2, 116, CENTRE_COLS, d.centres, { label: "Tous centres", a: d.total });
  p2.texts.push({
    x: M,
    y: end + 28,
    text: "Journées clôturées uniquement. Écart moyen : moyenne des écarts absolus journaliers.",
    size: 8.5,
    color: MUTED,
  });

  const pages = [p1, p2];
  pages.forEach((p, i) =>
    p.texts.push({ x: width - M, y: A4_LANDSCAPE.height - 20, text: `${company} · page ${i + 1}/${pages.length}`, size: 8, color: MUTED, align: "right" }),
  );
  return pages;
}
