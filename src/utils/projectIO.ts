import { resolveMapId } from "@/lib/mapIdentity";
import {
  createEmptyProject,
  type GridConfig,
  type MapProject,
  type PathDirection,
  type PlatformPanel,
  type SceneType,
  type SupplyMode,
  type UnloadMode,
} from "@/types/map";

const normalizeScene = (value: unknown): SceneType => (value === "simulation" ? "simulation" : "production");
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const normalizePositiveNumber = (value: unknown, fallback: number) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

type LegacyProjectJson = Partial<MapProject> & {
  version?: string;
};

type ExportedProjectJson = {
  format?: string;
  id?: unknown;
  name?: unknown;
  scene?: unknown;
  tags?: unknown;
  meterPerCell?: unknown;
  grid?: Partial<GridConfig> & {
    nodes?: unknown;
  };
  paths?: unknown;
  platformPanels?: unknown;
  devices?: unknown;
};

export const parseProjectJson = (raw: string): MapProject => {
  const data = JSON.parse(raw) as LegacyProjectJson & ExportedProjectJson;
  if (!isRecord(data)) {
    throw new Error("工程 JSON 无效");
  }

  const width = Number(data.grid?.width ?? 0);
  const height = Number(data.grid?.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("网格参数缺失或非法");
  }

  const name =
    typeof data.meta?.name === "string" && data.meta.name.trim().length > 0
      ? data.meta.name.trim()
      : typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : "factory-map";
  const scene = normalizeScene(data.meta?.scene ?? data.scene);
  const mapId = resolveMapId(data.meta?.id ?? data.id, name);
  const fallback = createEmptyProject(width, height, scene, name, mapId);
  const base = Array.isArray(data.layers?.base)
    ? data.layers.base
    : Array.isArray(data.grid?.nodes)
      ? data.grid.nodes
      : null;

  if (!base || base.length !== width * height) {
    throw new Error("base 图层长度与网格尺寸不一致");
  }

  const normalizedBase: MapProject["layers"]["base"] = base.map((item) => {
    if (item === 1 || item === 2 || item === 3) {
      return item;
    }
    return 0;
  });

  const rawPaths = Array.isArray(data.overlays?.robotPaths)
    ? data.overlays.robotPaths
    : Array.isArray(data.paths)
      ? data.paths
      : [];
  const normalizedPaths: MapProject["overlays"]["robotPaths"] = rawPaths.map((path, index) => ({
    id: path.id || `path-${index + 1}`,
    name: path.name || `Path-${index + 1}`,
    color: path.color || "#2563eb",
    direction: (path.direction === "bidirectional" ? "bidirectional" : "oneway") as PathDirection,
    points: (path.points ?? []).map((point: { x?: unknown; y?: unknown }) => ({
      x: Number(point.x ?? 0),
      y: Number(point.y ?? 0),
    })),
  }));

  const rawPanels = Array.isArray(data.overlays?.platformPanels)
    ? data.overlays.platformPanels
    : Array.isArray(data.platformPanels)
      ? data.platformPanels
      : [];
  const normalizedPanels: PlatformPanel[] = rawPanels.flatMap((panel, index) => {
    const x = Number(panel.x ?? 0);
    const y = Number(panel.y ?? 0);
    const panelWidth = Number(panel.width ?? 0);
    const panelHeight = Number(panel.height ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(panelWidth) || !Number.isFinite(panelHeight)) {
      return [];
    }
    if (panelWidth <= 0 || panelHeight <= 0) {
      return [];
    }
    const spec = panel.spec === "2x4" ? "2x4" : "1x2";
    return [
      {
        id: panel.id || `panel-${index + 1}`,
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        spec,
        rotated: Boolean(panel.rotated),
      },
    ];
  });

  const normalizedDevices: MapProject["devices"] = [];
  (data.devices ?? []).forEach((device, index) => {
    const type = String(device.type ?? "");
    const x = Number(device.x ?? 0);
    const y = Number(device.y ?? 0);

    if (type === "queue" || type === "waiting") {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        normalizedBase[y * width + x] = type === "queue" ? 2 : 3;
      }
      return;
    }

    if (type !== "supply" && type !== "unload" && type !== "charger") {
      return;
    }

    normalizedDevices.push({
      id: device.id || `dev-${index + 1}`,
      type,
      name: device.name || `device-${index + 1}`,
      x,
      y,
      config: {
        enabled: device.config?.enabled ?? true,
        hardwareId: device.config?.hardwareId ?? "",
        speedLimit: Number(device.config?.speedLimit ?? 1.2),
        maxQueue: Number(device.config?.maxQueue ?? 4),
        directionDeg: Number(device.config?.directionDeg ?? 0),
        supplyMode: (device.config?.supplyMode === "manual" || device.config?.supplyMode === "elevator"
          ? device.config.supplyMode
          : "auto") as SupplyMode,
        unloadMode: (device.config?.unloadMode === "multi-sort" ? "multi-sort" : "normal") as UnloadMode,
      },
    });
  });

  return {
    version: "2.0.0",
    meta: {
      ...fallback.meta,
      ...data.meta,
      id: mapId,
      name,
      scene,
      tags: Array.isArray(data.meta?.tags)
        ? data.meta.tags.filter((item) => typeof item === "string")
        : Array.isArray(data.tags)
          ? data.tags.filter((item) => typeof item === "string")
          : [],
      updatedAt: new Date().toISOString(),
    },
    grid: {
      width,
      height,
      chunkSize: normalizePositiveNumber(data.grid?.chunkSize, fallback.grid.chunkSize),
      cellSizeMeter: normalizePositiveNumber(
        data.grid?.cellSizeMeter ?? data.meterPerCell,
        fallback.grid.cellSizeMeter,
      ),
    },
    layers: {
      base: normalizedBase,
    },
    overlays: {
      robotPaths: normalizedPaths.length > 0 ? normalizedPaths : fallback.overlays.robotPaths,
      platformPanels: normalizedPanels,
    },
    devices: normalizedDevices,
  };
};
