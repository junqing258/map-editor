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
  name: string;
  createdAt: string;
  updatedAt: string;
  scene: SceneType;
  tags: string[];
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

export const emptyDeviceCounts = createDeviceCounts;

export const createEmptyProject = (
  width = DEFAULT_MAP_WIDTH,
  height = DEFAULT_MAP_HEIGHT,
  scene: SceneType = "production",
  name = "factory-map",
): MapProject => {
  const now = new Date().toISOString();
  return {
    version: "2.0.0",
    meta: {
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
          color: "#2563eb",
          direction: "oneway",
          points: [],
        },
      ],
      platformPanels: [],
    },
    devices: [],
  };
};
