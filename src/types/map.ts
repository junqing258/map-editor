/* eslint-disable @typescript-eslint/no-empty-object-type */
import { createMapId } from "@/lib/mapIdentity";
import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";

/** 画布底图单元状态：0 空白，1 平台，2 排队区，3 等待区。 */
export type CellValue = 0 | 1 | 2 | 3;
/** 仅表示“已占用平台”的单元状态。 */
export type PlatformCellValue = 1 | 2 | 3;

/** 地图场景类型。 */
export type SceneType = "production" | "simulation";
/** 编辑器当前激活的工具。 */
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

/** 路径方向：单向或双向。 */
export type PathDirection = "oneway" | "bidirectional";
/** 编辑器当前支持的设备类型。 */
export type DeviceType = "supply" | "unload" | "charger";
/** 供包设备模式：自动、人工、提升机。 */
export type SupplyMode = "auto" | "manual" | "elevator";
/** 卸包设备模式：普通口、多维分拣口。 */
export type UnloadMode = "normal" | "multi-sort";

/** 编辑器网格配置。 */
export interface GridConfig {
  width: number;
  height: number;
  chunkSize: number;
  cellSizeMeter: number;
}

/** 路径上的单个格子点。 */
export interface PathPoint {
  x: number;
  y: number;
}

/** 铺板规格。 */
export type PlatformPanelSpec = "1x2" | "2x4";

/** 通用格子坐标。 */
export interface CellCoord {
  x: number;
  y: number;
}

/** 平台铺板布局结果。 */
export interface PlatformPanel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spec: PlatformPanelSpec;
  rotated: boolean;
}

/** 框选状态下引用的路径点。 */
export interface SelectedPathPointRef {
  pathId: string;
  index: number;
  x: number;
  y: number;
}

/** 一次批量选择里包含的对象集合。 */
export interface BatchSelectionSource {
  deviceIds: string[];
  cells: CellCoord[];
  pathPoints: SelectedPathPointRef[];
}

/** 批量选择过滤器。 */
export interface BatchSelectionFilter {
  devices: boolean;
  cells: boolean;
  pathPoints: boolean;
}

/** 编辑器内部的路径对象。 */
export interface RobotPath {
  id: string;
  name: string;
  color: string;
  direction: PathDirection;
  points: PathPoint[];
}

/** 编辑器内部的设备配置。 */
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

/** 编辑器内部的设备对象。 */
export interface MapDevice {
  id: string;
  type: DeviceType;
  name: string;
  x: number;
  y: number;
  config: DeviceConfig;
}

/** 画布显示开关。 */
export interface ViewFlags {
  showGrid: boolean;
  showPath: boolean;
  showNavBlock: boolean;
  showPanelLayout: boolean;
}

/** 工具面板的可调参数。 */
export interface ToolOptions {
  platformMode: "drag" | "batch";
  batchRows: number;
  batchCols: number;
  pathDirection: PathDirection;
  supplyMode: SupplyMode;
  unloadMode: UnloadMode;
}

/** 编辑器地图元数据。 */
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

/** 标准地图协议中的通用设备结构。 */
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

/** 人工供包口。 */
export interface LoadEquipment extends Equipment { }

/** 提升机供包口。 */
export interface HoistEquipment extends Equipment { }

/** 普通卸包口。 */
export interface UnloadEquipment extends Equipment { }

/** 多维分拣口。 */
export interface SorterEquipment extends Equipment { }

/** 充电桩。 */
export interface ChargerEquipment extends Equipment { }

/** 自动供包口，可绑定多个连续导航点。 */
export interface AutoEquipment extends Omit<Equipment, "aboutBlock"> {
  aboutBlock: string[];
}

/** 设备朝向。 */
export enum Direction {
  E = "E",
  N = "N",
  S = "S",
  W = "W",
}

export type ISODateString = string;

/** 标准地图协议中的基础信息。 */
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

/** 地图原点。 */
export interface Original {
  x: number;
  y: number;
}

/** 标准地图协议中的导航点。 */
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

/** 导航点运行属性。 */
export interface Attr {
  dockable: boolean;
  rotatable: boolean;
  loadSpeed: null;
  unloadSpeed: null;
  loadAcceleration: null;
  unloadAcceleration: null;
}

/** 导航点业务属性。 */
export interface Location {
  label?: string;
  mark: number | null;
  tag: Tag | null;
  facing: number[];
  capacity: number | null;
}

/** 标准地图里常见的点位标签。 */
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

/** 当前标准地图中使用的导航点类型。 */
export enum Type {
  Mr = "mr",
}

/** 预留扩展元信息。 */
export interface Meta { }

/** 区域边界。 */
export interface AreaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 区域方向限制。 */
export type AreaDirectionLimit = "NoEntry" | "NoExit" | "NoConstraint";

/** 标准地图里的区域。 */
export interface Area {
  id: string;
  areaType: number;
  directionLimit: AreaDirectionLimit;
  bounds: AreaBounds;
  label: string;
  capacity: number | null;
}

/** 标准地图里的路径边。 */
export interface Path {
  lock: boolean;
  end: string;
  start: string;
  code: string;
}

/** 编辑器内部缓存的单元格导航点协议元数据。 */
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

/** 编辑器内部缓存的路径边协议元数据。 */
export interface PathEdgeMetadata {
  code: string;
  lock: boolean;
}

/** 标准地图协议中需要原样保留的集合字段。 */
export interface MapProjectProtocolCollections {
  basic: unknown[];
  advanced: unknown[];
  areas: Area[];
  arcs: unknown[];
  traffic: unknown[];
  devices: unknown[];
  infos: unknown[];
}

/** 编辑器为标准地图协议额外保留的信息。 */
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

/** 编辑器内部维护的协议保真层。 */
export interface MapProjectProtocol {
  meta: Meta;
  info: MapProjectProtocolInfo;
  collections: MapProjectProtocolCollections;
  marks: Record<string, CellMarkMetadata>;
  pathEdges: Record<string, PathEdgeMetadata>;
}

/** 编辑器运行时使用的完整地图对象。 */
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

/** 地图库中的单条记录。 */
export interface MapLibraryItem {
  id: string;
  name: string;
  draft: boolean;
  scene: SceneType;
  tags: string[];
  updatedAt: string;
  project: MapProject;
}

/** 当前选中对象的联合类型。 */
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

/** 导出格式：ROS 风格占据栅格或业务自定义协议。 */
export type ExportFormat = "ros" | "custom";

/** Worker 导出的文件载荷。 */
export interface ExportPayload {
  filename: string;
  mimeType: string;
  content: string;
}

/** 地图概览统计信息。 */
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

/** 路径检查结果。 */
export interface PathCheckResult {
  ok: boolean;
  issues: string[];
}

/** 默认空地图宽度。 */
export const DEFAULT_MAP_WIDTH = 96;
/** 默认空地图高度。 */
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

/** 创建一个默认的导航点协议元数据。 */
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

/** 创建一个可直接用于编辑器的新空地图。 */
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
