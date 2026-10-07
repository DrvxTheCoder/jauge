"use client";

import { useRef, useState } from "react";
import { ecartBand } from "@/lib/calc";
import { cap, cn, fmt, fmtDate } from "@/lib/format";
import type { Rules } from "@/lib/types";

export interface HeatCell {
  date: string; // yyyy-mm-dd
  v: number | null; // worst absolute écart of the day, %
  future: boolean;
  invId?: string; // inventory holding that worst écart
}

const ROWS = 7;
const EASE = "cubic-bezier(0.2, 0.9, 0.25, 1)"; // the shell's settle curve

/**
 * Fisheye response to the hovered cell: it grows, neighbours swell a little
 * and step aside so the grid bulges instead of overlapping.
 */
function bulge(k: number, focus: number | null) {
  if (focus == null) return { s: 1, x: 0, y: 0 };
  const dc = Math.floor(k / ROWS) - Math.floor(focus / ROWS);
  const dr = (k % ROWS) - (focus % ROWS);
  const d = Math.hypot(dc, dr);
  if (d === 0) return { s: 1.3, x: 0, y: 0 };
  // Tuned for 37px cells with 4px gaps: the push falls off slower than the
  // swell, so a gap of about 1px survives at every distance (no blob).
  const s = 1 + 0.07 * Math.exp(-((d - 1) ** 2) / 0.9);
  const push = 6 * Math.exp(-((d - 1) ** 2) / 3); // px, away from the focus
  return { s, x: (dc / d) * push, y: (dr / d) * push };
}

export function EcartHeatmap({ cells, rules, onOpen }: { cells: HeatCell[]; rules: Rules; onOpen: (invId: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<number | null>(null);
  // Kept after hiding so the text stays put while the tooltip fades out.
  const [tip, setTip] = useState<{ x: number; y: number; k: number; glide: boolean; on: boolean } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (k: number, el: HTMLElement) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    // Layout box, not the bounding rect: the cell is mid-transform. Its
    // offsetParent is the wrapper; the scroller may be scrolled sideways.
    const x = el.offsetLeft + el.offsetWidth / 2 - (scrollRef.current?.scrollLeft ?? 0);
    const y = el.offsetTop - el.offsetHeight * 0.15; // top edge once grown
    setFocus(k);
    // Already up: glide over from the previous cell. Otherwise place it
    // unseen at this cell, then rise and fade in on the next frame.
    setTip((t) => (t?.on ? { x, y, k, glide: true, on: true } : { x, y, k, glide: false, on: false }));
    requestAnimationFrame(() => setTip((t) => t && { ...t, on: true }));
  };
  const hide = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setFocus(null);
      setTip((t) => t && { ...t, on: false, glide: false });
    }, 80);
  };

  const tone = (c: HeatCell) => {
    if (c.future) return "bg-transparent";
    // Opaque tints (mixed with the card, not alpha) so swollen neighbours
    // overlapping during the bulge don't show darker seams.
    if (c.v == null) return "hatch bg-card";
    const b = ecartBand(c.v, rules);
    return b === "ok"
      ? c.v < rules.ecartOk / 2
        ? "bg-[color-mix(in_oklab,var(--ok)_45%,var(--card))]"
        : "bg-[color-mix(in_oklab,var(--ok)_75%,var(--card))]"
      : b === "warn"
        ? "bg-[color-mix(in_oklab,var(--warn)_70%,var(--card))]"
        : "bg-[color-mix(in_oklab,var(--alert)_80%,var(--card))]";
  };

  const cur = tip ? cells[tip.k] : null;
  const on = !!tip?.on;

  return (
    <div className="relative">
      {/* Padding gives scaled edge cells room inside the scroller. */}
      <div ref={scrollRef} className="-m-3 overflow-x-auto p-3">
        <div
          className={cn("grid max-w-[820px] min-w-[560px] grid-flow-col grid-rows-7 gap-1", focus != null && cells[focus]?.invId && "cursor-pointer")}
          role="group"
          aria-label="Écarts journaliers sur 20 semaines"
          onMouseLeave={hide}
          // On the grid, not the cells: neighbours step aside on hover, so the
          // pointer can sit in a widened gap while a cell is still focused.
          onClick={() => {
            const id = focus == null ? undefined : cells[focus]?.invId;
            if (id) onOpen(id);
          }}
        >
          {cells.map((c, k) => {
            const { s, x, y } = bulge(k, focus);
            const style = {
              transform: `translate(${x}px, ${y}px) scale(${s})`,
              transition: `transform 0.42s ${EASE}, box-shadow 0.3s ease`,
              zIndex: k === focus ? 2 : 1,
            };
            const label = `${cap(fmtDate(c.date, { weekday: "long", day: "numeric", month: "long" }))} : ${c.v == null ? "pas d'inventaire clôturé" : `${fmt(c.v, 2)} %`}`;
            if (c.future) return <span key={c.date} className="aspect-square" aria-hidden />;
            const cls = cn("relative aspect-square rounded-[4px] will-change-transform", tone(c), k === focus && "shadow-[0_6px_16px_-6px_rgba(4,17,10,0.45)]");
            return c.invId ? (
              <button
                key={c.date}
                type="button"
                aria-label={`${label}. Ouvrir l'inventaire`}
                onMouseEnter={(e) => show(k, e.currentTarget)}
                onFocus={(e) => show(k, e.currentTarget)}
                onBlur={hide}
                className={cls}
                style={style}
              />
            ) : (
              <span key={c.date} role="img" aria-label={label} onMouseEnter={(e) => show(k, e.currentTarget)} className={cls} style={style} />
            );
          })}
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10 rounded-xl bg-[var(--chart-tooltip-background)] px-3 py-2 text-[12px] whitespace-nowrap text-white shadow-[0_12px_28px_-12px_rgba(4,17,10,0.6)] backdrop-blur-sm"
        style={{
          opacity: on ? 1 : 0,
          transform: `translate(${tip?.x ?? 0}px, ${(tip?.y ?? 0) - (on ? 10 : 4)}px) translate(-50%, -100%)`,
          transition: !on ? "opacity 0.16s ease" : tip?.glide ? `transform 0.36s ${EASE}, opacity 0.18s ease` : `transform 0.24s ${EASE}, opacity 0.18s ease`,
        }}
      >
        {cur && (
          <>
            <p className="font-medium">{cap(fmtDate(cur.date, { weekday: "long", day: "numeric", month: "long" }))}</p>
            <p className="tnum mt-0.5 flex items-center gap-1.5 text-white/70">
              {cur.v == null ? (
                "Pas d'inventaire clôturé"
              ) : (
                <>
                  <span className={cn("size-2 rounded-full", tone(cur))} />
                  Écart <b className="font-semibold text-white">{fmt(cur.v, 2)} %</b>
                  {cur.invId && <span className="text-white/50">· clic pour ouvrir</span>}
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
