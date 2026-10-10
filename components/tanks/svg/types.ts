import type { ReactNode } from "react";

/** Per-instance ids, so several tanks on one page never share a gradient or clip. */
export type TankIds = { prefix: string };

/**
 * One tank drawing, split around the liquid:
 * `back` (empty vessel) → liquid → `front` (shading and highlights over the liquid) → `structure`.
 */
export interface TankArt {
  clip: () => ReactNode;
  back: (ids: TankIds) => ReactNode;
  front: (ids: TankIds) => ReactNode;
  structure: (ids: TankIds) => ReactNode;
}
