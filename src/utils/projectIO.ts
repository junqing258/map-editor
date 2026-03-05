import {
  createEmptyProject,
  type MapProject,
  type PathDirection,
  type SceneType,
  type SupplyMode,
  type UnloadMode,
} from "@/types/map";

const normalizeScene = (value: unknown): SceneType =>
  value === "simulation" ? "simulation" : "production";

export const parseProjectJson = (raw: string): MapProject => {
  const data = JSON.parse(raw) as Partial<MapProject> & {
    version?: string;
  };
  if (!data || typeof data !== "object") {
    throw new Error("工程 JSON 无效");
  }

  const width = Number(data.grid?.width ?? 0);
  const height = Number(data.grid?.height ?? 0);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("网格参数缺失或非法");
  }

  const name =
    typeof data.meta?.name === "string" && data.meta.name.trim().length > 0
      ? data.meta.name.trim()
      : "factory-map";
  const scene = normalizeScene(data.meta?.scene);
  const fallback = createEmptyProject(width, height, scene, name);
  const base = data.layers?.base;

  if (!base || base.length !== width * height) {
    throw new Error("base 图层长度与网格尺寸不一致");
  }

  const normalizedBase: MapProject["layers"]["base"] = base.map((item) => {
    if (item === 1 || item === 2 || item === 3) {
      return item;
    }
    return 0;
  });

  const normalizedPaths: MapProject["overlays"]["robotPaths"] =
    data.overlays?.robotPaths?.map((path, index) => ({
      id: path.id || `path-${index + 1}`,
      name: path.name || `Path-${index + 1}`,
      color: path.color || "#0ea5e9",
      direction: (path.direction === "bidirectional"
        ? "bidirectional"
        : "oneway") as PathDirection,
      points: (path.points ?? []).map((point) => ({
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
      })),
    })) ?? fallback.overlays.robotPaths;

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
        supplyMode: (device.config?.supplyMode === "manual" ||
        device.config?.supplyMode === "elevator"
          ? device.config.supplyMode
          : "auto") as SupplyMode,
        unloadMode: (device.config?.unloadMode === "multi-sort"
          ? "multi-sort"
          : "normal") as UnloadMode,
      },
    });
  });

  return {
    version: "2.0.0",
    meta: {
      ...fallback.meta,
      ...data.meta,
      name,
      scene,
      tags: Array.isArray(data.meta?.tags)
        ? data.meta.tags.filter((item) => typeof item === "string")
        : [],
      updatedAt: new Date().toISOString(),
    },
    grid: {
      ...fallback.grid,
      ...data.grid,
      width,
      height,
    },
    layers: {
      base: normalizedBase,
    },
    overlays: {
      robotPaths: normalizedPaths,
    },
    devices: normalizedDevices,
  };
};
