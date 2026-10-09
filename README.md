# Jauge — LPG production prototype

Clickable front-end prototype of a multi-tenant LPG production product (working name **Jauge**).
French UI, mock data for a fictional operator (**Baobab Énergie SA**, centres of Rufisque and Kaolack).
The Fernly template is the visual reference only; no template code is used.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
# or
npm run build && npm start
npm test           # Vitest: correction engine, demo data, config migration
```

Node 20+ recommended. No database or environment variables needed.

## Screens

| Route | What it shows |
|---|---|
| `/` | Dashboard: period KPIs, 7-day production bars, today's inventory, live productive-time timer (pause = stoppage), tank fill gauge, tank levels, recent inventories |
| `/inventaires` | Paginated, searchable list + month calendar coloured by écart band, monthly report card |
| `/inventaires/[id]` | Daily sheet: production time, night shift, tabs (supply, bottles day/night, bulk outflows, tanks, stoppages, vehicles), live stock balance, closing flow with écart confirmation, admin edit mode |
| `/analyses` | KPIs with sparklines, daily tonnage vs previous period (week-aligned), bottle mix, lost time by stoppage type, 20-week écart heatmap |
| `/parametres` | Tenant configuration: company + brand colour, centres & lines, tanks, supply/outflow fields per centre, bottle formats, calculation rules |

## How it's organised

```
app/                    routes (all client components in the prototype)
components/shell        sidebar (GSAP rail), topbar, centre switcher, page entrance
components/ui           shadcn-style primitives (Button, Card, Segmented, Switch, Dialog, Field…)
components/charts       hand-built SVG charts (bars, half gauge, donut, line, sparkline)
components/production   rolling-digit clock, live timer card, tank level
lib/types.ts            domain model (TenantConfig, Centre, Reservoir, Inventory…)
lib/calc.ts             per-inventory tank results, closing snapshots, mass balance, times/yields
lib/correction/         temperature correction engine (pure): table lookup, validation, CSV, profiles
lib/tenant-io.ts        config validation, JSON template import/export, localStorage migration
lib/aggregate.ts        period ranges and aggregation
lib/seed.ts             demo tenant + deterministic 150-day data generator
lib/store.tsx           client store (config, inventories, selected centre, toasts)
```

## Theming

A tenant picks **one** colour (`--brand`). Every shade (`--b-950` … `--b-50`) is derived with
`color-mix()` in `app/globals.css` and exposed to Tailwind as `brand-*` utilities, so any hex re-tints
the app and the report header preview. Status colours (ok / warn / alert) are fixed.

## What is mocked

- **Data:** generated client-side from today's date; deterministic per day. Configuration and edited
  inventories persist in `localStorage` ("Restaurer la démo" in Paramètres clears both).
- **Correction factors:** each tenant has correction profiles (Paramètres, Règles de calcul). The
  default reproduces the legacy sheets: `ambientDensity = d15 − liquidCorrection(tLiq)`,
  `gasT = (capacityM3 − volLiqM3) × gasCoefficient(tVap) × (pressureBar + 1)`. The temperature is
  rounded to tenths and the exact row is read; there is no interpolation. The built-in table is
  `lib/data/correction/butane-standard-15-36.csv`. `npm run gen:table` turns it into
  `lib/correction/default-table.ts`. Its `source` field is a placeholder: fill in the exact normative
  reference before production use. Closed inventories keep a snapshot of the factors they used.
- **Exports, auth, notifications, help:** buttons show a toast.
- **shadcn/ui & ReUI:** not installed (registries unreachable from the build sandbox). Primitives in
  `components/ui` follow shadcn conventions and can be swapped for the real ones.

## Suggested next steps toward the full product

1. Prisma schema with `tenantId` on every table + Postgres row-level security; mirror `lib/types.ts`.
2. Move `lib/correction` into its own package, with regression fixtures kept outside the demo repository.
3. Tank calibration tables (height → volume) per reservoir.
4. Server actions / route handlers replacing the client store; audit log on edits of closed inventories.
5. PDF (react-pdf) and Excel exports using tenant branding.
6. i18n (French first, English next) and an offline-capable entry mode for filling centres.
