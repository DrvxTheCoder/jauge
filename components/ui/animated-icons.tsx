"use client";

import { motion, type Transition } from "motion/react";

/**
 * Animated glyphs for the island, drawn on Hugeicons' grid: 24px viewBox,
 * 1.5 stroke, round caps and joins. Each plays once when it mounts; `still`
 * renders the final frame (reduced motion).
 */
export interface AnimatedIconProps {
  className?: string;
  still?: boolean;
}

const EASE = [0.65, 0, 0.35, 1] as const;
const POP: Transition = { type: "spring", visualDuration: 0.35, bounce: 0.5 };

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "size-5"}
    >
      {children}
    </svg>
  );
}

/** Props that draw a stroke in, after `delay` seconds. */
function draw(still: boolean | undefined, delay = 0, duration = 0.4) {
  return {
    initial: still ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { pathLength: { duration, ease: EASE, delay }, opacity: { duration: 0.01, delay } },
  } as const;
}

/** Props that pop an element in from nothing. */
function pop(still: boolean | undefined, delay = 0) {
  return {
    initial: still ? false : { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { ...POP, delay },
  } as const;
}

export function SuccessGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <motion.circle cx="12" cy="12" r="10" {...draw(still, 0, 0.45)} />
      <motion.path d="M8 12.5L10.5 15L16 9" {...draw(still, 0.28, 0.3)} />
    </Svg>
  );
}

export function ErrorGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <motion.circle cx="12" cy="12" r="10" {...draw(still, 0, 0.4)} />
      <motion.path d="M15 9L9 15" {...draw(still, 0.25, 0.2)} />
      <motion.path d="M9 9L15 15" {...draw(still, 0.38, 0.2)} />
    </Svg>
  );
}

export function WarningGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <motion.path
        d="M5.32 9.68C7.74 5.41 8.94 3.28 10.6 2.73C11.51 2.42 12.49 2.42 13.4 2.73C15.06 3.28 16.26 5.41 18.68 9.68C21.09 13.95 22.3 16.09 21.94 17.83C21.74 18.79 21.25 19.65 20.54 20.31C19.24 21.5 16.83 21.5 12 21.5C7.17 21.5 4.76 21.5 3.46 20.31C2.75 19.65 2.26 18.79 2.06 17.83C1.7 16.09 2.91 13.95 5.32 9.68Z"
        {...draw(still, 0, 0.5)}
      />
      <motion.path
        d="M12 9V13"
        initial={still ? false : { y: -4, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...POP, delay: 0.3 }}
      />
      <motion.path d="M11.99 16.5H12" {...pop(still, 0.45)} />
    </Svg>
  );
}

export function InfoGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <motion.circle cx="12" cy="12" r="10" {...draw(still, 0, 0.45)} />
      <motion.path d="M11.99 8H12" {...pop(still, 0.3)} />
      <motion.path d="M11.25 11H12V16.5" {...draw(still, 0.38, 0.25)} />
    </Svg>
  );
}

export function BellGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <motion.g
        style={{ originX: 0.5, originY: 0 }}
        initial={still ? false : { rotate: 0 }}
        animate={still ? undefined : { rotate: [0, 16, -13, 9, -5, 2, 0] }}
        transition={{ duration: 0.9, ease: "easeInOut", delay: 0.05 }}
      >
        <path d="M2.53 14.39C2.32 15.75 3.27 16.69 4.43 17.15C8.89 18.95 15.11 18.95 19.57 17.15C20.73 16.69 21.68 15.75 21.47 14.39C21.34 13.56 20.69 12.87 20.21 12.19C19.59 11.3 19.53 10.32 19.52 9.28C19.52 5.26 16.16 2 12 2C7.84 2 4.48 5.26 4.48 9.28C4.48 10.32 4.41 11.3 3.79 12.19C3.31 12.87 2.66 13.56 2.53 14.39Z" />
      </motion.g>
      <motion.path
        d="M9 21C9.8 21.62 10.85 22 12 22C13.15 22 14.2 21.62 15 21"
        initial={still ? false : { x: 0 }}
        animate={still ? undefined : { x: [0, -1.5, 1.5, -1, 0.5, 0] }}
        transition={{ duration: 0.9, ease: "easeInOut", delay: 0.12 }}
      />
    </Svg>
  );
}

/** Two bars; `breathe` keeps them softly pulsing while a stop is running. */
export function PauseGlyph({ className, still, breathe }: AnimatedIconProps & { breathe?: boolean }) {
  const bar = (x: number, i: number) => (
    <motion.rect
      key={x}
      x={x}
      y="5"
      width="5"
      height="14"
      rx="2"
      style={{ originY: 0.5 }}
      initial={still ? false : { scaleY: 0.2, opacity: 0 }}
      animate={breathe && !still ? { scaleY: [1, 0.78, 1], opacity: 1 } : { scaleY: 1, opacity: 1 }}
      transition={
        breathe && !still
          ? { scaleY: { duration: 1.6, ease: "easeInOut", repeat: Infinity, delay: i * 0.25 }, opacity: { duration: 0.15 } }
          : { ...POP, delay: i * 0.08 }
      }
    />
  );
  return <Svg className={className}>{[4, 15].map(bar)}</Svg>;
}

/** Clock whose hand sweeps continuously: something is running. */
export function ClockGlyph({ className, still }: AnimatedIconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <motion.g
        animate={still ? undefined : { rotate: 360 }}
        transition={{ duration: 6, ease: "linear", repeat: Infinity }}
      >
        {/* Invisible disc centres the group's box on the dial, so it turns about 12,12. */}
        <circle cx="12" cy="12" r="6" stroke="none" />
        <path d="M12 8V12L14 14" />
      </motion.g>
    </Svg>
  );
}

/** Page edges with arrows sliding outward (expanded) or inward (compact). */
export function ViewWidthGlyph({ className, still, to }: AnimatedIconProps & { to: "expanded" | "compact" }) {
  const out = to === "expanded";
  // Arrow pointing left, and its mirror; heads sit at the travel end.
  const left = out ? "M10 12H5M7.5 9.5L5 12L7.5 14.5" : "M5 12H10M7.5 9.5L10 12L7.5 14.5";
  const right = out ? "M14 12H19M16.5 9.5L19 12L16.5 14.5" : "M19 12H14M16.5 9.5L14 12L16.5 14.5";
  const from = out ? 2.5 : -2.5;
  const slide = { type: "spring", visualDuration: 0.45, bounce: 0.45, delay: 0.1 } as const;
  return (
    <Svg className={className}>
      <motion.path
        d="M2 5V19"
        initial={still ? false : { x: out ? 2 : -2 }}
        animate={{ x: 0 }}
        transition={slide}
      />
      <motion.path
        d="M22 5V19"
        initial={still ? false : { x: out ? -2 : 2 }}
        animate={{ x: 0 }}
        transition={slide}
      />
      <motion.path d={left} initial={still ? false : { x: from, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={slide} />
      <motion.path d={right} initial={still ? false : { x: -from, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={slide} />
    </Svg>
  );
}
