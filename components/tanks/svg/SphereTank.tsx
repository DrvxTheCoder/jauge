import { TANK_GEOMETRY } from "../tankGeometry";
import type { TankArt } from "./types";

/* Cleaned from public/assets/illustrations/SPHERE.svg: fills as attributes,
   the embedded PNG highlight replaced by a vector gradient. */

const { clipBox } = TANK_GEOMETRY.sphere;
const cx = clipBox.x + clipBox.w / 2;
const cy = clipBox.y + clipBox.h / 2;
const r = clipBox.w / 2;

const CRESCENT =
  "M90.41,46.5c-3.67,12.4-15.15,21.45-28.75,21.45-16.56,0-29.98-13.42-29.98-29.98,0-3.92.75-7.67,2.13-11.1,2.5,16.26,16.55,28.71,33.51,28.71,8.92,0,17.04-3.44,23.09-9.08Z";

const LEG = (x: number) => `${x + 2.03} 37.72 ${x} 40.67 ${x} 71.92 ${x + 4.06} 71.92 ${x + 4.06} 40.67 ${x + 2.03} 37.72`;

export const sphereArt: TankArt = {
  clip: () => <circle cx={cx} cy={cy} r={r} />,

  back: () => (
    <>
      {/* Top rail */}
      <g fill="#8696b0">
        <rect x="50.45" width="22.68" height=".25" />
        <rect x="49.83" y="3.49" width="23.93" height="1.96" />
        <rect x="50.45" y="2.18" width="22.68" height=".25" />
        {[50.66, 56.16, 61.67, 67.18, 72.68].map((x) => (
          <rect key={x} x={x} y=".12" width=".25" height="3.36" />
        ))}
        {[50.11, 54.58, 59.06, 63.53, 68.01, 72.48].map((x) => (
          <rect key={x} x={x} y="5.04" width="1" height="4.15" />
        ))}
      </g>
      {/* Rear legs */}
      <g fill="#475b7a">
        <polygon points={LEG(74.45)} />
        <polygon points={LEG(45.08)} />
      </g>
      {/* Shell */}
      <circle fill="#a2b5d1" cx="61.79" cy="37.69" r="31.05" />
      <ellipse fill="#96a5bc" cx="61.79" cy="38.66" rx="31.05" ry="30.58" />
      <path fill="#8696b0" d={CRESCENT} />
    </>
  ),

  front: ({ prefix }) => (
    <>
      <defs>
        <radialGradient id={`${prefix}-hl`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Lower shading, translucent so the liquid reads as inside the shell */}
      <path fill="#2a384c" opacity="0.16" d={CRESCENT} />
      {/* Specular highlight */}
      <ellipse fill={`url(#${prefix}-hl)`} opacity="0.32" cx="50.5" cy="22" rx="15" ry="10" transform="rotate(-28 50.5 22)" />
      {/* Inner wall edge */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#475b7a" strokeOpacity="0.3" strokeWidth="0.45" />
    </>
  ),

  structure: () => (
    <>
      <rect fill="#2a384c" x="31.73" y="71.92" width="60.13" height="3.31" />
      <g fill="#96a5be">
        <polygon points={LEG(36.67)} />
        <polygon points={LEG(59.91)} />
        <polygon points={LEG(83.16)} />
      </g>
    </>
  ),
};
