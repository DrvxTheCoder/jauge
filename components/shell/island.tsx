"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useAnimate, useReducedMotion, type Transition } from "motion/react";
import { useNow, useStore, type Notice, type NoticeKind } from "@/lib/store";
import { liveSeconds, RollingClock, useStopToggle } from "@/components/production/production";
import {
  BellGlyph,
  ClockGlyph,
  ErrorGlyph,
  InfoGlyph,
  PauseGlyph,
  SuccessGlyph,
  ViewWidthGlyph,
  WarningGlyph,
  type AnimatedIconProps,
} from "@/components/ui/animated-icons";
import { cn } from "@/lib/format";
import type { Inventory } from "@/lib/types";

export type HubVariant =
  | "idle"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "bell"
  | "pause"
  | "view"
  | "activity-compact"
  | "activity-expanded";

interface HubSize {
  width: number;
  height: number;
  borderRadius: number;
}

const TOAST: HubSize = { width: 260, height: 44, borderRadius: 22 };

/**
 * Every state has a fixed box; the hub springs straight to it. Content is
 * written to fit its box, never the other way round, so the shape is
 * known the moment the state changes.
 */
export const HUB_SIZES: Record<HubVariant, HubSize> = {
  idle: { width: 40, height: 8, borderRadius: 4 },
  success: TOAST,
  error: TOAST,
  warning: TOAST,
  info: TOAST,
  bell: TOAST,
  pause: TOAST,
  view: { width: 168, height: 40, borderRadius: 20 },
  "activity-compact": { width: 212, height: 36, borderRadius: 18 },
  "activity-expanded": { width: 340, height: 116, borderRadius: 28 },
};

// Status tones lifted toward white so they read on the dark hub.
const OK = "text-[color-mix(in_oklab,var(--ok)_55%,white)]";
const WARN = "text-[color-mix(in_oklab,var(--warn)_70%,white)]";
const ALERT = "text-[color-mix(in_oklab,var(--alert)_60%,white)]";

const KINDS: Record<NoticeKind, { variant: HubVariant; Glyph: (p: AnimatedIconProps) => React.JSX.Element; tint: string; ms: number }> = {
  info: { variant: "info", Glyph: InfoGlyph, tint: "text-white/75", ms: 3000 },
  success: { variant: "success", Glyph: SuccessGlyph, tint: OK, ms: 2600 },
  warning: { variant: "warning", Glyph: WarningGlyph, tint: WARN, ms: 3400 },
  error: { variant: "error", Glyph: ErrorGlyph, tint: ALERT, ms: 4000 },
  bell: { variant: "bell", Glyph: BellGlyph, tint: "text-white/75", ms: 3000 },
  pause: { variant: "pause", Glyph: PauseGlyph, tint: WARN, ms: 2400 },
  expanded: { variant: "view", Glyph: (p) => <ViewWidthGlyph {...p} to="expanded" />, tint: "text-white/75", ms: 1400 },
  compact: { variant: "view", Glyph: (p) => <ViewWidthGlyph {...p} to="compact" />, tint: "text-white/75", ms: 1400 },
};

/** The one spring every size change uses. */
const MORPH: Transition = { type: "spring", visualDuration: 0.42, bounce: 0.28 };
const EASE_OUT = [0.2, 0.9, 0.25, 1] as const;

/**
 * Dark hub, bottom centre. At rest it shows the inventory in progress;
 * a toast replaces whatever is showing at once, then hands back.
 */
export function Island() {
  const { notice, dismissNotice, inventories, centreId, config } = useStore();
  const path = usePathname();
  const reduce = !!useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const vw = useViewportWidth();

  const live =
    inventories.find((i) => i.status === "EN_COURS" && (centreId === "all" || i.centreId === centreId)) ?? null;
  // The dashboard and the inventory itself already show the timer card.
  const showLive = !!live && path !== "/" && path !== `/inventaires/${live.id}`;

  const variant: HubVariant = notice
    ? KINDS[notice.kind].variant
    : showLive
      ? open
        ? "activity-expanded"
        : "activity-compact"
      : "idle";
  const size = fit(HUB_SIZES[variant], vw);
  // Keys the content: a new key swaps it, whatever was there.
  const key = notice ? `n${notice.id}` : showLive ? `live-${open ? "open" : "pill"}-${!!live?.pausedAt}` : "idle";

  // Collapse the details when leaving the page or when the activity ends.
  useEffect(() => setOpen(false), [path, showLive]);

  // Outside click or Escape folds the details back.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!scope.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, scope]);

  // Hiding drops pointer events, so a pending hover-end may never arrive.
  useEffect(() => setHover(false), [notice?.id]);

  // One timer, for the notice on screen; replaced or hovered, it's cancelled.
  useEffect(() => {
    if (!notice || hover) return;
    const t = setTimeout(() => dismissNotice(notice.id), KINDS[notice.kind].ms);
    return () => clearTimeout(t);
  }, [notice, hover, dismissNotice]);

  // Errors give the hub a short head shake.
  useEffect(() => {
    if (notice?.kind !== "error" || reduce || !scope.current) return;
    animate(scope.current, { x: [0, -6, 5, -3, 2, 0] }, { duration: 0.45, ease: "easeOut", delay: 0.1 });
  }, [notice, reduce, animate, scope]);

  const idle = variant === "idle";

  return (
    <>
      {/* Announced separately so the morphing visuals never re-read. */}
      <div className="sr-only" role="status" aria-live="polite">
        {notice?.kind !== "error" ? notice?.msg : ""}
      </div>
      <div className="sr-only" role="alert">
        {notice?.kind === "error" ? notice.msg : ""}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <motion.div
          ref={scope}
          aria-hidden={idle}
          initial={false}
          animate={{ ...size, opacity: idle ? 0 : 1 }}
          transition={reduce ? { duration: 0 } : { ...MORPH, opacity: { duration: 0.18 } }}
          onHoverStart={() => setHover(true)}
          onHoverEnd={() => setHover(false)}
          className={cn(
            "relative overflow-hidden bg-brand-950 text-white shadow-[0_14px_34px_-12px_rgba(4,17,10,0.6)] ring-1 ring-white/10",
            !idle && "pointer-events-auto",
          )}
        >
          <AnimatePresence initial={false}>
            {!idle && (
              <Slot key={key} size={size} reduce={reduce}>
                {notice ? (
                  <NoticeView notice={notice} reduce={reduce} onClose={() => dismissNotice(notice.id)} />
                ) : live && open ? (
                  <LiveExpanded inv={live} reduce={reduce} />
                ) : live ? (
                  <LiveCompact inv={live} reduce={reduce} onOpen={() => setOpen(true)} />
                ) : null}
              </Slot>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}

/**
 * Content box at its variant's own size, centred in the hub and clipped by
 * it. Mid-morph it never reflows; it just shows more or less of itself.
 * Incoming fades up with a little blur; outgoing leaves fast, out of flow.
 */
function Slot({ size, reduce, children }: { size: HubSize; reduce: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 m-auto"
      style={{ width: size.width, height: size.height }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: "blur(6px)" }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        transition: reduce ? { duration: 0.15 } : { duration: 0.26, ease: EASE_OUT, delay: 0.04 },
      }}
      exit={{
        opacity: 0,
        ...(reduce ? {} : { scale: 0.96, filter: "blur(2px)" }),
        pointerEvents: "none",
        transition: { duration: reduce ? 0.1 : 0.12, ease: "easeIn" },
      }}
    >
      {children}
    </motion.div>
  );
}

function NoticeView({ notice, reduce, onClose }: { notice: Notice; reduce: boolean; onClose: () => void }) {
  const { Glyph, tint } = KINDS[notice.kind];
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`${notice.msg} (fermer)`}
      className="flex size-full items-center justify-center gap-2.5 px-4 whitespace-nowrap"
    >
      <span className={cn("grid size-6 shrink-0 place-items-center", tint)}>
        <Glyph className="size-[21px]" still={reduce} />
      </span>
      <span className="min-w-0 truncate text-[14px]">{notice.msg}</span>
    </button>
  );
}

/** Live figures for an inventory: productive time, or the running stop. */
function useLive(inv: Inventory) {
  const { config } = useStore();
  const now = useNow(1000);
  const paused = !!inv.pausedAt;
  const secs = paused
    ? Math.max(Math.floor((now.getTime() - new Date(inv.pausedAt!).getTime()) / 1000), 0)
    : Math.floor(liveSeconds(inv, now, config.rules.lunchBreakMin));
  return { paused, secs, name: config.centres.find((c) => c.id === inv.centreId)?.name ?? "" };
}

function LiveGlyph({ paused, reduce, className }: { paused: boolean; reduce: boolean; className: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center", paused ? WARN : OK)}>
      {paused ? <PauseGlyph className={className} still={reduce} breathe /> : <ClockGlyph className={className} still={reduce} />}
    </span>
  );
}

function LiveCompact({ inv, reduce, onOpen }: { inv: Inventory; reduce: boolean; onOpen: () => void }) {
  const { paused, name, secs } = useLive(inv);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={paused ? `Arrêt en cours à ${name}, afficher le détail` : `Inventaire en cours à ${name}, afficher le détail`}
      className="flex size-full items-center justify-center gap-2 px-3.5 whitespace-nowrap"
    >
      <LiveGlyph paused={paused} reduce={reduce} className="size-5 text-white" />
      <span className="min-w-0 truncate text-[13px] text-white/65">{paused ? "Arrêt" : name}</span>
      <RollingClock seconds={secs} tight className="shrink-0 text-[13px]" />
    </button>
  );
}

function LiveExpanded({ inv, reduce }: { inv: Inventory; reduce: boolean }) {
  const { paused, name, secs } = useLive(inv);
  const router = useRouter();
  const toggle = useStopToggle(inv);
  const stops = inv.stops.length;
  return (
    <div className="flex size-full flex-col justify-between p-4 whitespace-nowrap">
      <div className="flex items-center gap-3">
        <LiveGlyph paused={paused} reduce={reduce} className="size-5 text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-white/60">{paused ? "Arrêt en cours" : "Inventaire en cours"}</p>
          <p className="truncate text-[14px] font-medium">{name}</p>
        </div>
        <RollingClock seconds={secs} tight className="shrink-0 text-[22px]" />
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] text-white/60">
          {paused ? "Temps utile en pause" : `Depuis ${inv.heureDebut} · ${stops} arrêt${stops > 1 ? "s" : ""}`}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="h-8 shrink-0 rounded-full bg-white/12 px-3.5 text-[13px] font-medium hover:bg-white/20"
        >
          {paused ? "Reprendre" : "Arrêt"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/inventaires/${inv.id}`)}
          className="h-8 shrink-0 rounded-full bg-white px-3.5 text-[13px] font-medium text-brand-950 hover:bg-white/85"
        >
          Ouvrir
        </button>
      </div>
    </div>
  );
}

/** Narrow screens keep a 16px gutter each side. */
function fit(size: HubSize, vw: number): HubSize {
  return { ...size, width: Math.min(size.width, vw - 32) };
}

function useViewportWidth() {
  const [vw, setVw] = useState(Infinity);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vw;
}
