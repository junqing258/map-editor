import type {
  ExportFormat,
  ExportPayload,
  MapProject,
  RasterStats
} from "@/types/map";

interface WorkerRequest {
  requestId: number;
  type: "stats" | "export";
  payload: {
    project: MapProject;
    format?: ExportFormat;
  };
}

interface WorkerResponse {
  requestId: number;
  ok: boolean;
  result?: RasterStats | ExportPayload;
  error?: string;
}

const calcStats = (project: MapProject): RasterStats => {
  const width = project.grid.width;
  const height = project.grid.height;
  const obstacleCount = project.layers.base.reduce<number>(
    (acc, value) => (value === 1 ? acc + 1 : acc),
    0
  );
  const total = width * height;
  const freeCount = total - obstacleCount;
  return {
    width,
    height,
    obstacleCount,
    freeCount,
    occupancyRate: total === 0 ? 0 : obstacleCount / total
  };
};

const exportRosLike = (project: MapProject): ExportPayload => {
  const occupancyGrid = project.layers.base.map((value) => (value === 1 ? 100 : 0));
  const rosLike = {
    format: "ros-occupancy-grid-like",
    frame_id: "map",
    resolution: project.grid.cellSizeMeter,
    width: project.grid.width,
    height: project.grid.height,
    origin: [0, 0, 0],
    data: occupancyGrid
  };
  return {
    filename: `${project.meta.name}-ros.json`,
    mimeType: "application/json",
    content: JSON.stringify(rosLike, null, 2)
  };
};

const exportCustom = (project: MapProject): ExportPayload => {
  const payload = {
    format: "robot-grid-v1",
    mapName: project.meta.name,
    meterPerCell: project.grid.cellSizeMeter,
    grid: {
      width: project.grid.width,
      height: project.grid.height,
      data: project.layers.base
    },
    paths: project.overlays.robotPaths
  };
  return {
    filename: `${project.meta.name}-robot-grid.json`,
    mimeType: "application/json",
    content: JSON.stringify(payload, null, 2)
  };
};

const workerSelf = self as unknown as Worker;

workerSelf.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  const post = (resp: WorkerResponse) => {
    workerSelf.postMessage(resp);
  };

  try {
    if (req.type === "stats") {
      post({
        requestId: req.requestId,
        ok: true,
        result: calcStats(req.payload.project)
      });
      return;
    }

    if (req.type === "export") {
      const format = req.payload.format ?? "custom";
      const result =
        format === "ros"
          ? exportRosLike(req.payload.project)
          : exportCustom(req.payload.project);
      post({
        requestId: req.requestId,
        ok: true,
        result
      });
      return;
    }

    post({
      requestId: req.requestId,
      ok: false,
      error: `Unsupported worker request: ${req.type}`
    });
  } catch (error) {
    post({
      requestId: req.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error"
    });
  }
};
