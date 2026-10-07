"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "@/lib/format";

export type DismissReason = "outside" | "escape";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Floating panel anchored to a trigger. It uses the native popover API, so it
 * renders in the top layer: never clipped by a scrolling card or table, and it
 * stays above an open <dialog>. It still lives next to its trigger in the DOM,
 * so focus order and a dialog's inertness behave as if it were inline.
 */
export function Popover({
  open,
  anchor,
  onDismiss,
  align = "start",
  matchWidth,
  className,
  children,
  ...rest
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onDismiss: (reason: DismissReason) => void;
  align?: "start" | "end";
  matchWidth?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const ref = useRef<HTMLDivElement>(null);
  const side = useRef<"top" | "bottom">("bottom");
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const place = useCallback(() => {
    const el = ref.current;
    const a = anchor.current;
    if (!el || !a) return;
    const r = a.getBoundingClientRect();
    if (matchWidth) el.style.minWidth = `${r.width}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 6;
    const m = 8;
    const below = window.innerHeight - r.bottom - gap - m;
    const above = r.top - gap - m;
    side.current = h > below && above > below ? "top" : "bottom";
    const top = side.current === "bottom" ? r.bottom + gap : r.top - gap - h;
    const left = align === "end" ? r.right - w : r.left;
    el.style.top = `${Math.max(top, m)}px`;
    el.style.left = `${Math.min(Math.max(left, m), window.innerWidth - w - m)}px`;
  }, [anchor, align, matchWidth]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const shown = el.matches(":popover-open");
    gsap.killTweensOf(el);
    if (open) {
      if (!shown) el.showPopover();
      place();
      const dy = side.current === "bottom" ? -6 : 6;
      gsap.fromTo(
        el,
        { opacity: 0, y: dy, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: reduced() ? 0 : 0.22, ease: "power3.out", transformOrigin: side.current === "bottom" ? "50% 0%" : "50% 100%" },
      );
    } else if (shown) {
      gsap.to(el, {
        opacity: 0,
        y: side.current === "bottom" ? -4 : 4,
        scale: 0.98,
        duration: reduced() ? 0 : 0.14,
        ease: "power2.in",
        onComplete: () => {
          if (el.matches(":popover-open")) el.hidePopover();
        },
      });
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const el = ref.current!;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.contains(t) || anchor.current?.contains(t)) return;
      dismiss.current("outside");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // keeps an enclosing <dialog> open
      e.stopPropagation();
      dismiss.current("escape");
    };
    let raf = 0;
    const follow = (e?: Event) => {
      if (e?.target instanceof Node && el.contains(e.target)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const ro = new ResizeObserver(() => follow());
    ro.observe(el);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, place, anchor]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.matches(":popover-open")) el.hidePopover();
    };
  }, []);

  return (
    <div
      ref={ref}
      popover="manual"
      // A click inside must not re-trigger an enclosing <label>'s control.
      onClick={(e) => e.preventDefault()}
      className={cn(
        "fixed inset-auto m-0 overflow-visible border-0 bg-transparent p-0 text-ink opacity-0",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The panel surface every picker shares. */
export const panelCls = "rounded-2xl bg-card shadow-[0_18px_40px_-18px_rgba(4,17,10,0.35),0_2px_6px_-2px_rgba(4,17,10,0.08)] ring-1 ring-line";

/** Scrolls `item` into the middle of `list` without touching outer scrollers. */
export function centerIn(list: HTMLElement | null, item: HTMLElement | null, smooth = false) {
  if (!list || !item) return;
  const top = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
  list.scrollTo({ top: Math.max(top, 0), behavior: smooth && !reduced() ? "smooth" : "auto" });
}

/** Keeps `item` visible in `list`, scrolling as little as possible. */
export function revealIn(list: HTMLElement | null, item: HTMLElement | null) {
  if (!list || !item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 4;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
}
