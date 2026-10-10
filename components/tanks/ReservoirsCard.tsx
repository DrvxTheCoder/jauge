"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/primitives";
import type { TankType } from "@/lib/types";
import { TankCard } from "./TankCard";
import { TankSlider } from "./TankSlider";

export interface TankStock {
  key: string;
  name: string;
  type: TankType;
  pct: number;
  t: number;
  capT: number;
}

/** Dashboard "Réservoirs" card. Tanks follow the configured order (`centre.reservoirs`). */
export function ReservoirsCard({ tanks, blocked, warned, className }: { tanks: TankStock[]; blocked: string[]; warned: number; className?: string }) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-center justify-between">
        <CardTitle>Réservoirs</CardTitle>
        <Link href="/parametres?tab=reservoirs" className="rounded-full border border-ink/70 px-3 py-1 text-[13px] font-medium hover:bg-brand-50">
          Configurer
        </Link>
      </div>
      {tanks.length > 0 ? (
        <TankSlider
          label="Réservoirs"
          slides={tanks.map((t) => ({
            key: t.key,
            label: t.name,
            node: <TankCard name={t.name} type={t.type} pct={t.pct} tonnes={t.t} capT={t.capT} />,
          }))}
        />
      ) : (
        <p className="text-[14px] text-muted">Aucune mesure de réservoir pour le moment.</p>
      )}
      {/* <p className="mt-5 text-[12px] text-muted">Dernière mesure saisie. Poids liquide corrigé à la température.</p> */}
      {(blocked.length > 0 || warned > 0) && (
        <p className="mt-1.5 text-[12px] text-warn">
          {blocked.length > 0 && `Sans résultat, mesure hors table : ${blocked.join(", ")}. `}
          {warned > 0 && `${warned} réservoir${warned > 1 ? "s" : ""} avec avertissement de correction. Voir la fiche du jour.`}
        </p>
      )}
    </Card>
  );
}
