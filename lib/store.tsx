"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIG, generateInventories } from "./seed";
import { migrateStoredConfig, storedConfig } from "./tenant-io";
import type { Centre, Inventory, TenantConfig } from "./types";

const CONFIG_KEY = "jauge:config"; // { version, config }, see STORAGE_VERSION
const LEGACY_CONFIG_KEY = "jauge:config:v1"; // bare v1 config, migrated on boot
const EDITS_KEY = "jauge:edits:v1"; // inventories changed on this device, by id
const DENSITY_KEY = "jauge:density"; // a per-device display preference, not tenant config

export type Density = "compact" | "expanded";

/** What a notice is about; picks the island's icon, tint and how long it stays. */
export type NoticeKind = "info" | "success" | "warning" | "error" | "expanded" | "compact" | "pause" | "bell";
export interface Notice {
  id: number;
  msg: string;
  kind: NoticeKind;
}

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
  toast: (msg: string, kind?: NoticeKind) => void;
  notice: Notice | null; // the one on screen; a new toast replaces it
  dismissNotice: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfigState] = useState<TenantConfig>(DEFAULT_CONFIG);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [centreId, setCentreId] = useState("ruf");
  const [density, setDensityState] = useState<Density>("compact");
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeSeq = useRef(0);

  // Client-only boot: mock data depends on "today", and saved branding lives on this device.
  useEffect(() => {
    let cfg = DEFAULT_CONFIG;
    try {
      const raw = localStorage.getItem(CONFIG_KEY) ?? localStorage.getItem(LEGACY_CONFIG_KEY);
      const m = migrateStoredConfig(raw);
      cfg = m.config;
      if (m.migrated) {
        localStorage.setItem(CONFIG_KEY, storedConfig(cfg));
        localStorage.removeItem(LEGACY_CONFIG_KEY);
      }
      if (m.notice) setNotice({ id: ++noticeSeq.current, msg: "Configuration restaurée", kind: "warning" });
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
        localStorage.setItem(CONFIG_KEY, storedConfig(next));
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
      localStorage.removeItem(LEGACY_CONFIG_KEY);
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

  // Latest wins: a new toast replaces the current one at once, never queues.
  const toast = useCallback((msg: string, kind: NoticeKind = "info") => {
    setNotice({ id: ++noticeSeq.current, msg, kind });
  }, []);

  const dismissNotice = useCallback((id: number) => setNotice((n) => (n?.id === id ? null : n)), []);

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
      notice,
      dismissNotice,
    }),
    [ready, config, setConfig, resetConfig, inventories, updateInventory, centreId, density, setDensity, centre, toast, notice, dismissNotice],
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
