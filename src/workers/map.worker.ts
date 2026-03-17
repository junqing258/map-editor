import type { ExportFormat, ExportPayload, MapOverviewStats, MapProject } from "@/types/map";

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
  result?: MapOverviewStats | ExportPayload;
  error?: string;
}

const calcStats = (project: MapProject): MapOverviewStats => {
  const width = project.grid.width;
  const height = project.grid.height;
  const nodeCount = project.layers.base.reduce<number>((acc, cell) => (cell > 0 ? acc + 1 : acc), 0);
  const queueCellCount = project.layers.base.reduce<number>((acc, cell) => (cell === 2 ? acc + 1 : acc), 0);
  const waitingCellCount = project.layers.base.reduce<number>((acc, cell) => (cell === 3 ? acc + 1 : acc), 0);
  const freeCount = width * height - nodeCount;
  const deviceCounts: MapOverviewStats["deviceCounts"] = {
    supply: 0,
    unload: 0,
    charger: 0,
  };
  project.devices.forEach((device) => {
    deviceCounts[device.type] += 1;
  });
  const pathCount = project.overlays.robotPaths.length;
  const pathPointCount = project.overlays.robotPaths.reduce((acc, path) => acc + path.points.length, 0);
  return {
    width,
    height,
    nodeCount,
    freeCount,
    queueCellCount,
    waitingCellCount,
    siteAreaSqm: width * project.grid.cellSizeMeter * height * project.grid.cellSizeMeter,
    pathCount,
    pathPointCount,
    deviceCounts,
  };
};

const exportRosLike = (project: MapProject): ExportPayload => {
  const occupancy = project.layers.base.map((value) => (value > 0 ? 0 : 100));
  const payload = {
    format: "ros-occupancy-grid-like",
    frame_id: "map",
    resolution: project.grid.cellSizeMeter,
    width: project.grid.width,
    height: project.grid.height,
    origin: [0, 0, 0],
    data: occupancy,
  };
  return {
    filename: `${project.meta.name}-ros-like.json`,
    mimeType: "application/json",
    content: JSON.stringify(payload, null, 2),
  };
};

const exportCustom = (project: MapProject): ExportPayload => {
  const payload = {
    format: "hyperleap-map-v2",
    name: project.meta.name,
    scene: project.meta.scene,
    tags: project.meta.tags,
    meterPerCell: project.grid.cellSizeMeter,
    grid: {
      width: project.grid.width,
      height: project.grid.height,
      chunkSize: project.grid.chunkSize,
      nodes: project.layers.base,
    },
    paths: project.overlays.robotPaths,
    platformPanels: project.overlays.platformPanels,
    devices: project.devices,
  };
  return {
    filename: `${project.meta.name}-map-v2.json`,
    mimeType: "application/json",
    content: JSON.stringify(payload, null, 2),
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
        result: calcStats(req.payload.project),
      });
      return;
    }
    if (req.type === "export") {
      const format = req.payload.format ?? "custom";
      const result = format === "ros" ? exportRosLike(req.payload.project) : exportCustom(req.payload.project);
      post({
        requestId: req.requestId,
        ok: true,
        result,
      });
      return;
    }
    post({
      requestId: req.requestId,
      ok: false,
      error: `Unsupported worker request type: ${req.type}`,
    });
  } catch (error) {
    post({
      requestId: req.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};
