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
lib/calc.ts             measurement engine + mass balance + times/yields
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
- **Correction factors:** `lib/calc.ts` uses a linear thermal-expansion approximation where the
  ASTM D1250 Table 54E lookup belongs (keep the `Math.round(t * 10) / 10` rounding when plugging it in).
  Vapour mass uses the ideal-gas law with a butane-rich molar mass.
- **Exports, auth, notifications, help:** buttons show a toast.
- **shadcn/ui & ReUI:** not installed (registries unreachable from the build sandbox). Primitives in
  `components/ui` follow shadcn conventions and can be swapped for the real ones.

## Suggested next steps toward the full product

1. Prisma schema with `tenantId` on every table + Postgres row-level security; mirror `lib/types.ts`.
2. Move `lib/calc.ts` into its own package with the official tables and regression fixtures from real monthly reports.
3. Tank calibration tables (height → volume) per reservoir.
4. Server actions / route handlers replacing the client store; audit log on edits of closed inventories.
5. PDF (react-pdf) and Excel exports using tenant branding.
6. i18n (French first, English next) and an offline-capable entry mode for filling centres.
