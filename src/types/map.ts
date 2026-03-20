import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { createMapId } from "@/lib/mapIdentity";

export type CellValue = 0 | 1 | 2 | 3;
export type PlatformCellValue = 1 | 2 | 3;

export type SceneType = "production" | "simulation";
export type ToolType =
  | "select"
  | "path-draw"
  | "path-erase"
  | "platform"
  | "supply"
  | "unload"
  | "charger"
  | "queue"
  | "waiting";

export type PathDirection = "oneway" | "bidirectional";
export type DeviceType = "supply" | "unload" | "charger";
export type SupplyMode = "auto" | "manual" | "elevator";
export type UnloadMode = "normal" | "multi-sort";

export interface GridConfig {
  width: number;
  height: number;
  chunkSize: number;
  cellSizeMeter: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export type PlatformPanelSpec = "1x2" | "2x4";

export interface CellCoord {
  x: number;
  y: number;
}

export interface PlatformPanel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spec: PlatformPanelSpec;
  rotated: boolean;
}

export interface SelectedPathPointRef {
  pathId: string;
  index: number;
  x: number;
  y: number;
}

export interface BatchSelectionSource {
  deviceIds: string[];
  cells: CellCoord[];
  pathPoints: SelectedPathPointRef[];
}

export interface BatchSelectionFilter {
  devices: boolean;
  cells: boolean;
  pathPoints: boolean;
}

export interface RobotPath {
  id: string;
  name: string;
  color: string;
  direction: PathDirection;
  points: PathPoint[];
}

export interface DeviceConfig {
  enabled: boolean;
  hardwareId: string;
  speedLimit: number;
  maxQueue: number;
  directionDeg: number;
  supplyMode?: SupplyMode;
  unloadMode?: UnloadMode;
  boundCells?: CellCoord[];
  left?: boolean;
  right?: boolean;
}

export interface MapDevice {
  id: string;
  type: DeviceType;
  name: string;
  x: number;
  y: number;
  config: DeviceConfig;
}

export interface ViewFlags {
  showGrid: boolean;
  showPath: boolean;
  showNavBlock: boolean;
  showPanelLayout: boolean;
}

export interface ToolOptions {
  platformMode: "drag" | "batch";
  batchRows: number;
  batchCols: number;
  pathDirection: PathDirection;
  supplyMode: SupplyMode;
  unloadMode: UnloadMode;
}

export interface MapProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scene: SceneType;
  tags: string[];
}

/**
 * 标准地图协议：与 sorting_app_2.0/src/types/map.d.ts 对齐。
 */
export interface MapInterface {
  id: string;
  meta: Meta;
  info: Info;
  basic: unknown[];
  advanced: unknown[];
  marks: Mark[];
  areas: Area[];
  paths: Path[];
  arcs: unknown[];
  traffic: unknown[];
  devices: unknown[];
  infos: unknown[];
  loadEquipments: LoadEquipment[];
  autoEquipments: AutoEquipment[];
  hoistEquipments: HoistEquipment[];
  unloadEquipments: UnloadEquipment[];
  sorterEquipments: SorterEquipment[];
  chargerEquipments: ChargerEquipment[];
}

export interface Equipment {
  id: string;
  x: number;
  y: number;
  name: string;
  aboutBlock: string;
  direction: Direction;
  left?: boolean;
  right?: boolean;
}

export interface LoadEquipment extends Equipment {}

export interface HoistEquipment extends Equipment {}

export interface UnloadEquipment extends Equipment {}

export interface SorterEquipment extends Equipment {}

export interface ChargerEquipment extends Equipment {}

export interface AutoEquipment extends Omit<Equipment, "aboutBlock"> {
  aboutBlock: string[];
}

export enum Direction {
  E = "E",
  N = "N",
  S = "S",
  W = "W",
}

export type ISODateString = string;

export interface Info {
  name: string;
  key: string;
  layer: number;
  width: number;
  height: number;
  blocks: number;
  max_value: number;
  resolution: number;
  simulation: boolean;
  interval: number;
  original: Original;
  create_date: ISODateString;
  modify_date: ISODateString;
  last_modify_user: string;
  groups: string[];
}

export interface Original {
  x: number;
  y: number;
}

export interface Mark {
  code: string;
  type: Type;
  bb: null;
  z: number;
  x: number;
  y: number;
  heading: number[];
  lock: boolean;
  location: Location;
  trafficRule: null;
  attr: Attr;
}

export interface Attr {
  dockable: boolean;
  rotatable: boolean;
  loadSpeed: null;
  unloadSpeed: null;
  loadAcceleration: null;
  unloadAcceleration: null;
}

export interface Location {
  label?: string;
  mark: number | null;
  tag: Tag | null;
  facing: number[];
  capacity: number | null;
}

export enum Tag {
  ChargerPort = "chargerPort",
  LoadPort = "loadPort",
  UnloadPort = "unloadPort",
  SorterPort = "sorterPort",
  AutoPort = "autoPort",
  LiftPort = "liftPort",
  WaitPort = "waitPort",
  QueuePort = "queuePort",
}

export enum Type {
  Mr = "mr",
}

export interface Meta {}

export interface AreaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type AreaDirectionLimit = "NoEntry" | "NoExit" | "NoConstraint";

export interface Area {
  id: string;
  areaType: number;
  directionLimit: AreaDirectionLimit;
  bounds: AreaBounds;
  label: string;
  capacity: number | null;
}

export interface Path {
  lock: boolean;
  end: string;
  start: string;
  code: string;
}

export interface CellMarkMetadata {
  code: string;
  type: Type;
  bb: null;
  z: number;
  heading: number[];
  lock: boolean;
  location: Location;
  trafficRule: null;
  attr: Attr;
}

export interface PathEdgeMetadata {
  code: string;
  lock: boolean;
}

export interface MapProjectProtocolCollections {
  basic: unknown[];
  advanced: unknown[];
  areas: Area[];
  arcs: unknown[];
  traffic: unknown[];
  devices: unknown[];
  infos: unknown[];
}

export interface MapProjectProtocolInfo {
  key: string;
  layer: number;
  maxValue: number;
  lastModifyUser: string;
  original: Original;
  resolution: number;
  interval: number;
  blockSize: number;
}

export interface MapProjectProtocol {
  meta: Meta;
  info: MapProjectProtocolInfo;
  collections: MapProjectProtocolCollections;
  marks: Record<string, CellMarkMetadata>;
  pathEdges: Record<string, PathEdgeMetadata>;
}

export interface MapProject {
  version: "2.0.0";
  meta: MapProjectMeta;
  grid: GridConfig;
  layers: {
    base: CellValue[];
  };
  overlays: {
    robotPaths: RobotPath[];
    platformPanels: PlatformPanel[];
  };
  devices: MapDevice[];
  protocol: MapProjectProtocol;
}

export interface MapLibraryItem {
  id: string;
  name: string;
  draft: boolean;
  scene: SceneType;
  tags: string[];
  updatedAt: string;
  project: MapProject;
}

export type SelectedElement =
  | { kind: "none" }
  | { kind: "cell"; x: number; y: number; active: boolean }
  | {
      kind: "path-point";
      pathId: string;
      pathName: string;
      index: number;
      x: number;
      y: number;
      direction: PathDirection;
    }
  | { kind: "device"; deviceId: string }
  | { kind: "device-batch"; deviceIds: string[] }
  | {
      kind: "mixed-batch";
      deviceIds: string[];
      cells: CellCoord[];
      pathPoints: SelectedPathPointRef[];
    };

export type ExportFormat = "ros" | "custom";

export interface ExportPayload {
  filename: string;
  mimeType: string;
  content: string;
}

export interface MapOverviewStats {
  width: number;
  height: number;
  nodeCount: number;
  freeCount: number;
  queueCellCount: number;
  waitingCellCount: number;
  siteAreaSqm: number;
  pathCount: number;
  pathPointCount: number;
  deviceCounts: Record<DeviceType, number>;
}

export interface PathCheckResult {
  ok: boolean;
  issues: string[];
}

export const DEFAULT_MAP_WIDTH = 96;
export const DEFAULT_MAP_HEIGHT = 64;

const createDeviceCounts = (): Record<DeviceType, number> => ({
  supply: 0,
  unload: 0,
  charger: 0,
});

const createDefaultAttr = (): Attr => ({
  dockable: true,
  rotatable: true,
  loadSpeed: null,
  unloadSpeed: null,
  loadAcceleration: null,
  unloadAcceleration: null,
});

const createDefaultLocation = (): Location => ({
  mark: null,
  tag: null,
  facing: [],
  capacity: null,
});

const createEmptyProtocol = (mapId: string, cellSizeMeter = 0.55): MapProjectProtocol => ({
  meta: {},
  info: {
    key: mapId,
    layer: 0,
    maxValue: 1,
    lastModifyUser: "",
    original: {
      x: 0,
      y: 0,
    },
    resolution: cellSizeMeter / 40,
    interval: Math.round(cellSizeMeter * 1000),
    blockSize: 40,
  },
  collections: {
    basic: [],
    advanced: [],
    areas: [],
    arcs: [],
    traffic: [],
    devices: [],
    infos: [],
  },
  marks: {},
  pathEdges: {},
});

export const createDefaultCellMarkMetadata = (code: string): CellMarkMetadata => ({
  code,
  type: Type.Mr,
  bb: null,
  z: 0,
  heading: [],
  lock: false,
  location: createDefaultLocation(),
  trafficRule: null,
  attr: createDefaultAttr(),
});

export const emptyDeviceCounts = createDeviceCounts;

export const createEmptyProject = (
  width = DEFAULT_MAP_WIDTH,
  height = DEFAULT_MAP_HEIGHT,
  scene: SceneType = "production",
  name = "factory-map",
  id = createMapId(name),
): MapProject => {
  const now = new Date().toISOString();
  return {
    version: "2.0.0",
    meta: {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      scene,
      tags: [],
    },
    grid: {
      width,
      height,
      chunkSize: 16,
      cellSizeMeter: 0.55,
    },
    layers: {
      base: new Array(width * height).fill(0),
    },
    overlays: {
      robotPaths: [
        {
          id: "path-main",
          name: "Main Route",
          color: PATH_COLOR_PALETTE[0],
          direction: "oneway",
          points: [],
        },
      ],
      platformPanels: [],
    },
    devices: [],
    protocol: createEmptyProtocol(id, 0.55),
  };
};
