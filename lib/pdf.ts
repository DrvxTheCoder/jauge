/**
 * Minimal PDF writer: text and filled rectangles on A4 pages, in the two
 * standard Helvetica faces (no embedding). Enough for tabular reports.
 * Coordinates are in points from the top-left corner.
 */

export type Rgb = [number, number, number];

export interface PdfText {
  x: number;
  y: number; // baseline
  text: string;
  size?: number;
  bold?: boolean;
  color?: Rgb;
  align?: "left" | "right";
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: Rgb;
}

export interface PdfPage {
  texts: PdfText[];
  rects?: PdfRect[];
}

export const A4_LANDSCAPE = { width: 842, height: 595 };

// Helvetica advance widths (per 1000 em) for the characters reports use most;
// anything else falls back to an average. Good enough to right-align figures.
const NARROW = " ,.:;'!|()[]/-";
function charWidth(c: string, bold: boolean) {
  if (c >= "0" && c <= "9") return 556;
  if (NARROW.includes(c)) return c === "-" || c === "(" || c === ")" || c === "/" ? 333 : 278;
  if (c === "%") return 889;
  if (c >= "A" && c <= "Z") return bold ? 722 : 667;
  return bold ? 584 : 520;
}

export function textWidth(s: string, size: number, bold = false) {
  return ([...latin1(s)].reduce((w, c) => w + charWidth(c, bold), 0) * size) / 1000;
}

/** Map to WinAnsi-safe characters: French number spacing, dashes, quotes. */
function latin1(s: string) {
  return s
    .replace(/[   ]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

const esc = (s: string) => latin1(s).replace(/[\\()]/g, (c) => `\\${c}`);
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const rgb = ([r, g, b]: Rgb) => `${n(r / 255)} ${n(g / 255)} ${n(b / 255)}`;

function contentStream(page: PdfPage, height: number) {
  const ops: string[] = [];
  for (const r of page.rects ?? []) ops.push(`${rgb(r.color)} rg ${n(r.x)} ${n(height - r.y - r.h)} ${n(r.w)} ${n(r.h)} re f`);
  for (const t of page.texts) {
    const size = t.size ?? 10;
    const x = t.align === "right" ? t.x - textWidth(t.text, size, t.bold) : t.x;
    ops.push(`BT /${t.bold ? "F2" : "F1"} ${n(size)} Tf ${rgb(t.color ?? [0, 0, 0])} rg 1 0 0 1 ${n(x)} ${n(height - t.y)} Tm (${esc(t.text)}) Tj ET`);
  }
  return ops.join("\n");
}

export function pdfDocument(pages: PdfPage[], size = A4_LANDSCAPE): Blob {
  const objs: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((p, i) => {
    const id = pageIds[i];
    const stream = contentStream(p, size.height);
    objs[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objs[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Every character is a single byte by now, so string offsets are byte offsets.
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}
