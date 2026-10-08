"use client";

import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Activity01Icon,
  ArrowDataTransferHorizontalIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Clock01Icon,
  ComputerIcon,
  CustomerSupportIcon,
  CylinderIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  FileExportIcon,
  Factory01Icon,
  LogoutSquare02Icon,
  Menu09Icon,
  Moon02Icon,
  Notification01Icon,
  PaintBoardIcon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  PolyTankIcon,
  PreferenceHorizontalIcon,
  RotateLeft01Icon,
  Search01Icon,
  Settings02Icon,
  LayoutLeftIcon,
  LayoutRightIcon,
  SquareLock02Icon,
  TaskDaily01Icon,
  Tick02Icon,
  Xls02Icon,
} from "@hugeicons/core-free-icons";

export type IconProps = Omit<HugeiconsProps, "icon" | "ref">;
export type Icon = (props: IconProps) => React.JSX.Element;

/**
 * App-wide icon set, backed by Hugeicons. Each export is named for its role
 * so call sites read like components: <Plus className="size-4" />.
 */
const make = (svg: IconSvgElement): Icon => {
  const C = (props: IconProps) => <HugeiconsIcon icon={svg} {...props} />;
  return C;
};

// Navigation and shell
export const LayoutGrid = make(DashboardSquare01Icon);
export const ClipboardList = make(TaskDaily01Icon);
export const ChartColumn = make(Activity01Icon);
export const Settings2 = make(Settings02Icon);
export const LifeBuoy = make(CustomerSupportIcon);
export const LogOut = make(LogoutSquare02Icon);
export const Search = make(Search01Icon);
export const Bell = make(Notification01Icon);
export const Menu = make(Menu09Icon);
export const X = make(Cancel01Icon);
export const PanelLeftClose = make(LayoutRightIcon);
export const PanelLeftOpen = make(LayoutLeftIcon);

// Actions
export const Plus = make(Add01Icon);
export const Trash2 = make(Delete02Icon);
export const Pencil = make(PencilEdit02Icon);
export const Check = make(Tick02Icon);
export const Download = make(FileExportIcon);
export const FileDown = make(FileExportIcon);
export const FileSpreadsheet = make(Xls02Icon);
export const RotateCcw = make(RotateLeft01Icon);
export const Play = make(PlayIcon);
export const Pause = make(PauseIcon);
export const Lock = make(SquareLock02Icon);
export const Moon = make(Moon02Icon);

// Direction
export const ArrowLeft = make(ArrowLeft02Icon);
export const ChevronLeft = make(ArrowLeft01Icon);
export const ChevronRight = make(ArrowRight01Icon);
export const ChevronDown = make(ArrowDown01Icon);
export const ArrowDown = make(ArrowDown02Icon);

// Pickers
export const CalendarDays = make(Calendar03Icon);
export const Clock = make(Clock01Icon);

// Settings sections
export const Palette = make(PaintBoardIcon);
export const Factory = make(Factory01Icon);
export const Container = make(PolyTankIcon);
export const ArrowLeftRight = make(ArrowDataTransferHorizontalIcon);
export const Cylinder = make(CylinderIcon);
export const SlidersHorizontal = make(PreferenceHorizontalIcon);
export const Monitor = make(ComputerIcon);
