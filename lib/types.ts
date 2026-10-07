export type TankType = "SPHERE" | "CIGARE" | "AUTRE";
export type CalcMode = "AUTOMATIC" | "PERCENTAGE";
export type InventoryStatus = "EN_COURS" | "TERMINE";

export interface FlowField {
  id: string;
  label: string;
}

export interface ProductionLine {
  id: string;
  name: string;
  capacityTph: number;
}

export interface Reservoir {
  id: string;
  name: string;
  type: TankType;
  capacityM3: number;
  capacityT: number;
  heightMm: number;
  calcMode: CalcMode;
}

export interface Centre {
  id: string;
  code: string;
  name: string;
  address: string;
  managers: string[];
  lines: ProductionLine[];
  reservoirs: Reservoir[];
  approFields: FlowField[];
  sortieFields: FlowField[];
}

export interface BottleType {
  id: string;
  label: string;
  kg: number;
}

export interface Rules {
  ecartOk: number; // % — at or below is "good"
  ecartWarn: number; // % — above this needs confirmation on close
  lunchBreakMin: number;
  correctionTable: string;
  stopTypes: string[];
}

export interface Branding {
  companyName: string;
  shortName: string;
  brand: string; // one hex, every shade derives from it
}

export interface TenantConfig {
  branding: Branding;
  rules: Rules;
  bottleTypes: BottleType[];
  centres: Centre[];
}

export interface TankReading {
  heightMm: number;
  tLiq: number;
  tVap: number;
  volLiqM3: number;
  pressureBar: number;
  d15: number;
}

export interface Stop {
  id: string;
  type: string;
  minutes: number;
  note: string;
  author: string;
  at: string; // ISO
}

export interface VehicleCounts {
  decharges: [number, number]; // [COM, LIV]
  charges: [number, number];
  nonDecharges: [number, number];
  dechargesNonCharges: [number, number];
  notes: string;
}

export interface NightShift {
  enabled: boolean;
  thtMin: number;
  taMin: number;
  lineIds: string[];
  bottles: Record<string, number>;
}

export interface Inventory {
  id: string; // `${centreId}_${yyyy-mm-dd}`
  centreId: string;
  date: string; // yyyy-mm-dd
  status: InventoryStatus;
  startedBy: string;
  stockInitial: number;
  heureDebut: string; // HH:mm
  heureFin: string; // HH:mm or ""
  appro: Record<string, number>;
  sorties: Record<string, number>;
  bottles: Record<string, number>;
  night: NightShift;
  tanks: Record<string, TankReading>;
  stops: Stop[];
  vehicles: VehicleCounts;
  notes: string;
  pausedAt?: string; // ISO — an arrêt is running on the live timer
}
