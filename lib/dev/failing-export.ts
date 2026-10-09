/**
 * DEV ONLY. Temporary: an export that crawls for 15 seconds, then fails, to
 * exercise the hub's progress-to-error transition. Delete this file and the
 * "Test : export en échec" button in app-shell.tsx to remove it.
 */
import type { OnProgress, ReportFile } from "@/lib/year-report";

const DURATION_MS = 15_000;
const TICK_MS = 500;

export async function failingExport(onProgress: OnProgress): Promise<ReportFile> {
  const start = Date.now();
  onProgress(0);
  while (Date.now() - start < DURATION_MS) {
    await new Promise((r) => setTimeout(r, TICK_MS));
    onProgress(Math.min((Date.now() - start) / DURATION_MS, 1) * 0.86);
  }
  throw new Error("Échec de l'export (test)");
}
