import { createEmptyProject, type MapProject } from "@/types/map";

export const parseProjectJson = (raw: string): MapProject => {
  const data = JSON.parse(raw) as Partial<MapProject>;
  if (!data || typeof data !== "object") {
    throw new Error("工程 JSON 无效");
  }
  const width = data.grid?.width;
  const height = data.grid?.height;
  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error("网格参数缺失或非法");
  }

  const fallback = createEmptyProject(width, height);
  const base = data.layers?.base;
  if (!base || base.length !== width * height) {
    throw new Error("base 图层长度与网格尺寸不一致");
  }

  return {
    version: data.version ?? "1.0.0",
    meta: {
      ...fallback.meta,
      ...data.meta,
      updatedAt: new Date().toISOString()
    },
    grid: {
      ...fallback.grid,
      ...data.grid
    },
    layers: {
      base: base.map((item) => (item === 1 ? 1 : 0))
    },
    overlays: {
      robotPaths: data.overlays?.robotPaths ?? fallback.overlays.robotPaths
    }
  };
};
