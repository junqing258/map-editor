export type CellValue = 0 | 1;
export type ToolType = "obstacle" | "erase" | "path";
export type SelectedElement =
  | { kind: "none" }
  | { kind: "cell"; x: number; y: number; value: CellValue }
  | {
      kind: "path-point";
      pathId: string;
      pathName: string;
      index: number;
      x: number;
      y: number;
      color: string;
    };

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

export interface RobotPath {
  id: string;
  name: string;
  color: string;
  points: PathPoint[];
}

export interface MapProjectMeta {
  name: string;
  createdAt: string;
  updatedAt: string;
  scene: "industrial";
}

export interface MapProject {
  version: "1.0.0";
  meta: MapProjectMeta;
  grid: GridConfig;
  layers: {
    base: CellValue[];
  };
  overlays: {
    robotPaths: RobotPath[];
  };
}

export interface RasterStats {
  width: number;
  height: number;
  obstacleCount: number;
  freeCount: number;
  occupancyRate: number;
}

export type ExportFormat = "ros" | "custom";

export interface ExportPayload {
  filename: string;
  mimeType: string;
  content: string;
}

export const createEmptyProject = (width = 120, height = 80): MapProject => {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    meta: {
      name: "factory-map",
      createdAt: now,
      updatedAt: now,
      scene: "industrial"
    },
    grid: {
      width,
      height,
      chunkSize: 16,
      cellSizeMeter: 0.1
    },
    layers: {
      base: new Array(width * height).fill(0)
    },
    overlays: {
      robotPaths: [
        {
          id: "path-main",
          name: "Main Route",
          color: "#ef4444",
          points: []
        }
      ]
    }
  };
};
