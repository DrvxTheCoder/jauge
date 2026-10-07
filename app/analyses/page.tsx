"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileSpreadsheet } from "@/components/ui/icons";
import { useScopedInventories, useStore } from "@/lib/store";
import { aggregate, delta } from "@/lib/aggregate";
import { summarize } from "@/lib/calc";
import { iso } from "@/lib/seed";
import { cn, fmt, fmtDate, parseISO } from "@/lib/format";
import { Button, Card, CardTitle, Segmented } from "@/components/ui/primitives";
import { Breakdown, Donut, LineChart, Sparkline, TimeRings } from "@/components/charts/charts";
import { EcartHeatmap, type HeatCell } from "@/components/charts/heatmap";

type Range = "7" | "30" | "90";

export default function AnalysesPage() {
  const { config, centre, toast } = useStore();
  const router = useRouter();
  const invs = useScopedInventories();
  const [range, setRange] = useState<Range>("30");
  const n = Number(range);

  const data = useMemo(() => {
    const t = new Date();
    const days: string[] = [];
    for (let k = n; k >= 1; k--) days.push(iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - k))); // up to yesterday: closed days
    // Shift by whole weeks so weekdays line up with the previous period
    const shift = Math.round(n / 7) * 7;
    const prevDays = days.map((d) => {
      const x = parseISO(d);
      return iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() - shift));
    });
    const closed = invs.filter((i) => i.status === "TERMINE");
    const byDay = new Map<string, typeof closed>();
    for (const i of closed) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);

    const series = (list: string[]) =>
      list.map((d) => {
        const l = byDay.get(d) ?? [];
        let t = 0;
        let bottles = 0;
        let utile = 0;
        let ec = 0;
        for (const inv of l) {
          const s = summarize(inv, centre(inv.centreId), config);
          t += s.conditionneT;
          bottles += s.bottlesDayN + s.bottlesNightN;
          utile += s.utileMin + s.nightUtileMin;
          ec += Math.abs(s.ecartPct);
        }
        return { t, bottles, tph: utile ? t / (utile / 60) : 0, ec: l.length ? ec / l.length : 0, has: l.length > 0 };
      });

    const curAll = series(days);
    const prevAll = series(prevDays);
    // Plot production days only (days off would read as collapses)
    const keep = curAll.map((d, k) => d.has || prevAll[k].has);
    const cur = curAll.filter((_, k) => keep[k]);
    const prev = prevAll.filter((_, k) => keep[k]);
    const plotDays = days.filter((_, k) => keep[k]);
    const curSet = new Set(days);
    const prevSet = new Set(prevDays);
    const aCur = aggregate(closed.filter((i) => curSet.has(i.date)), config, centre);
    const aPrev = aggregate(closed.filter((i) => prevSet.has(i.date)), config, centre);
    return { days, plotDays, cur, prev, aCur, aPrev };
  }, [invs, n, centre, config]);

  // 20-week écart heatmap, Monday-aligned columns
  const heat = useMemo(() => {
    const t = new Date();
    const end = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const startMonday = new Date(end.getFullYear(), end.getMonth(), end.getDate() - ((end.getDay() + 6) % 7) - 19 * 7);
    // Worst écart of each day, and the inventory it comes from
    const worst = new Map<string, { v: number; id: string }>();
    for (const i of invs) {
      if (i.status !== "TERMINE") continue;
      const v = Math.abs(summarize(i, centre(i.centreId), config).ecartPct);
      if (v >= (worst.get(i.date)?.v ?? -1)) worst.set(i.date, { v, id: i.id });
    }
    const cells: HeatCell[] = [];
    for (let k = 0; k < 140; k++) {
      const d = new Date(startMonday.getFullYear(), startMonday.getMonth(), startMonday.getDate() + k);
      const key = iso(d);
      const w = worst.get(key);
      cells.push({ date: key, v: w?.v ?? null, future: d > end, invId: w?.id });
    }
    return cells;
  }, [invs, centre, config]);

  const sparkT = data.cur.map((d) => d.t);
  const kpis = [
    { label: "Tonnage conditionné", value: `${fmt(data.aCur.conditionneT, 0)} T`, d: delta(data.aCur.conditionneT, data.aPrev.conditionneT), spark: sparkT },
    { label: "Bouteilles produites", value: fmt(data.aCur.bottlesN), d: delta(data.aCur.bottlesN, data.aPrev.bottlesN), spark: data.cur.map((x) => x.bottles) },
    { label: "Rendement horaire", value: `${fmt(data.aCur.rendementTph, 1)} T/h`, d: delta(data.aCur.rendementTph, data.aPrev.rendementTph), spark: data.cur.filter((x) => x.has).map((x) => x.tph) },
    { label: "Écart moyen absolu", value: `${fmt(data.aCur.meanAbsEcart, 2)} %`, d: data.aPrev.days ? data.aCur.meanAbsEcart - data.aPrev.meanAbsEcart : null, points: true, invert: true, spark: data.cur.filter((x) => x.has).map((x) => x.ec) },
  ];

  // Biggest causes first; the long tail folds into "Autres" to keep the pie legible.
  const stopsSorted = Object.entries(data.aCur.stopsByType).sort((a, b) => b[1] - a[1]);
  const stops = stopsSorted.length > 6 ? [...stopsSorted.slice(0, 5), ["Autres", stopsSorted.slice(5).reduce((a, [, m]) => a + m, 0)] as [string, number]] : stopsSorted;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold tracking-[-0.03em] sm:text-[40px]">Analyses</h1>
          <p className="mt-1 text-[15px] text-muted">
            Journées clôturées du {fmtDate(data.days[0], { day: "numeric", month: "short" })} au {fmtDate(data.days[data.days.length - 1], { day: "numeric", month: "short" })}, comparées à la période précédente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented
            options={[
              { value: "7", label: "7 j" },
              { value: "30", label: "30 j" },
              { value: "90", label: "90 j" },
            ]}
            value={range}
            onChange={setRange}
            label="Période"
          />
          <Button variant="ghost" onClick={() => toast("Export Excel dans la version complète")}>
            <FileSpreadsheet className="size-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const good = k.d == null ? null : k.invert ? k.d <= 0 : k.d >= 0;
          return (
            <Card as="article" key={k.label} className="flex flex-col gap-2 p-0! overflow-hidden">
              <div className="p-5 flex flex-col gap-1.5">
                <p className="text-[14px] text-muted">{k.label}</p>
                <p className="tnum text-[30px] leading-tight font-semibold tracking-[-0.03em]">{k.value}</p>
                <p className={cn("tnum text-[13px] font-medium", good == null ? "text-muted" : good ? "text-ok" : "text-alert")}>
                  {k.d == null ? "Pas de comparaison" : `${k.d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(k.d), k.points ? 2 : 1)} ${k.points ? "pt" : "%"}`}
                </p>
              </div>
              <Sparkline values={k.spark.length > 1 ? k.spark : [0, 0]} className="mt-auto" />
            </Card>
          );
        })}

        <Card className="sm:col-span-2 xl:col-span-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Tonnage conditionné par jour</CardTitle>
              <p className="text-[13px] text-muted">Trait plein : période ; pointillés : période précédente.</p>
            </div>
          </div>
          <LineChart
            current={data.cur.map((d) => d.t)}
            previous={data.prev.map((d) => d.t)}
            dates={data.plotDays}
          />
        </Card>

        <Card className="sm:col-span-2 xl:col-span-1">
          <CardTitle>Rapports</CardTitle>
          <p className="mt-1 text-[13px] text-muted">Mêmes chiffres que cet écran, mis en page pour la direction.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => toast("Rapport mensuel PDF dans la version complète")}>
              <FileDown className="size-4" />
              Rapport mensuel PDF
            </Button>
            <Button variant="ghost" onClick={() => toast("Export Excel dans la version complète")}>
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
          </div>
          <dl className="tnum mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Approvisionné</dt>
              <dd className="font-semibold">{fmt(data.aCur.approT, 0)} T</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Sorti en vrac</dt>
              <dd className="font-semibold">{fmt(data.aCur.vracT, 0)} T</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Écart cumulé</dt>
              <dd className="font-semibold">
                {data.aCur.ecartT >= 0 ? "+" : "−"}
                {fmt(Math.abs(data.aCur.ecartT), 1)} T
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-4 sm:col-span-2 lg:grid-cols-3 xl:col-span-4">
          <Card>
            <div className="mb-4">
              <CardTitle>Production par type de bouteille</CardTitle>
              <p className="text-[13px] text-muted">Tonnage conditionné par format</p>
            </div>
            <Donut
              centerLabel="conditionnées"
              items={config.bottleTypes
                .map((b) => ({ label: b.label, value: data.aCur.byBottle[b.id]?.t ?? 0, sub: `${fmt(data.aCur.byBottle[b.id]?.n ?? 0)} u.` }))
                .filter((x) => x.value > 0)}
            />
          </Card>

          <Card>
            <div className="mb-4">
              <CardTitle>Temps perdu par type d&apos;arrêt</CardTitle>
              <p className="tnum text-[13px] text-muted">{fmt(data.aCur.stopMin / 60, 1)} h au total</p>
            </div>
            {stops.length === 0 ? (
              <p className="py-8 text-center text-muted">Aucun arrêt sur la période.</p>
            ) : (
              <Breakdown variant="pie" unit="min" decimals={0} items={stops.map(([label, value]) => ({ label, value, color: label === "Autres" ? "var(--faint)" : undefined }))} />
            )}
          </Card>

          <Card>
            <div className="mb-4">
              <CardTitle>Temps de production</CardTitle>
              <p className="text-[13px] text-muted">Postes de jour, pause déjeuner déduite</p>
            </div>
            <TimeRings totalMin={data.aCur.totalMin} utileMin={data.aCur.totalMin - data.aCur.stopMin} />
          </Card>
        </div>

        <Card className="sm:col-span-2 xl:col-span-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Écarts sur 20 semaines</CardTitle>
              <p className="text-[13px] text-muted">Un carré par jour, le pire écart du jour si plusieurs centres.</p>
            </div>
            <ul className="flex flex-wrap gap-3 text-[12px] text-muted">
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-ok/70" />≤ {config.rules.ecartOk} %</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-warn/70" />≤ {config.rules.ecartWarn} %</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-alert/80" />Au-delà</li>
              <li className="flex items-center gap-1.5"><span className="hatch size-3 rounded-[4px]" />N/A</li>
            </ul>
          </div>
          <EcartHeatmap cells={heat} rules={config.rules} onOpen={(id) => router.push(`/inventaires/${id}`)} />
        </Card>
      </div>
    </div>
  );
}
