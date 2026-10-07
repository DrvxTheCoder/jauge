"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIG, generateInventories } from "./seed";
import type { Centre, Inventory, TenantConfig } from "./types";

const CONFIG_KEY = "jauge:config:v1";
const EDITS_KEY = "jauge:edits:v1"; // inventories changed on this device, by id
const DENSITY_KEY = "jauge:density"; // a per-device display preference, not tenant config

export type Density = "compact" | "expanded";

interface Store {
  ready: boolean;
  config: TenantConfig;
  setConfig: (fn: (c: TenantConfig) => TenantConfig) => void;
  resetConfig: () => void;
  inventories: Inventory[];
  updateInventory: (id: string, fn: (i: Inventory) => Inventory) => void;
  centreId: string; // "all" or a centre id
  setCentreId: (id: string) => void;
  density: Density;
  setDensity: (d: Density) => void;
  centre: (id: string) => Centre;
  user: { name: string; email: string; role: string };
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfigState] = useState<TenantConfig>(DEFAULT_CONFIG);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [centreId, setCentreId] = useState("ruf");
  const [density, setDensityState] = useState<Density>("compact");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-only boot: mock data depends on "today", and saved branding lives on this device.
  useEffect(() => {
    let cfg = DEFAULT_CONFIG;
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) cfg = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
    setConfigState(cfg);
    let edits: Record<string, Inventory> = {};
    try {
      edits = JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}");
    } catch {}
    setInventories(generateInventories(cfg).map((i) => edits[i.id] ?? i));
    try {
      if (localStorage.getItem(DENSITY_KEY) === "expanded") setDensityState("expanded");
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", config.branding.brand);
  }, [config.branding.brand]);

  const setConfig = useCallback((fn: (c: TenantConfig) => TenantConfig) => {
    setConfigState((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {}
  }, []);

  const resetConfig = useCallback(() => {
    try {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(EDITS_KEY);
    } catch {}
    setConfigState(DEFAULT_CONFIG);
    setInventories(generateInventories(DEFAULT_CONFIG));
  }, []);

  const updateInventory = useCallback((id: string, fn: (i: Inventory) => Inventory) => {
    setInventories((list) =>
      list.map((i) => {
        if (i.id !== id) return i;
        const next = fn(i);
        try {
          const edits = JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}");
          edits[id] = next;
          localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
        } catch {}
        return next;
      }),
    );
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const centre = useCallback(
    (id: string) => config.centres.find((c) => c.id === id) ?? config.centres[0],
    [config.centres],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      config,
      setConfig,
      resetConfig,
      inventories,
      updateInventory,
      centreId,
      setCentreId,
      density,
      setDensity,
      centre,
      user: { name: "Awa Ndiaye", email: "a.ndiaye@baobab-energie.sn", role: "Chef de production" },
      toast,
      toastMsg,
    }),
    [ready, config, setConfig, resetConfig, inventories, updateInventory, centreId, density, setDensity, centre, toast, toastMsg],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

/** Inventories for the selected centre ("all" = every centre), newest first. */
export function useScopedInventories() {
  const { inventories, centreId } = useStore();
  return useMemo(
    () => (centreId === "all" ? inventories : inventories.filter((i) => i.centreId === centreId)),
    [inventories, centreId],
  );
}

/** Re-renders every `ms` so in-progress figures stay live. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
