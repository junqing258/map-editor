import { toRaw } from "vue";

import type { ExportFormat, ExportPayload, MapOverviewStats, MapProject } from "@/types/map";
import { safeStructuredClone } from "@/utils/safeClone";

type PendingResolver = {
  resolve: (value: MapOverviewStats | ExportPayload) => void;
  reject: (reason?: unknown) => void;
};

export const useMapWorker = () => {
  const worker = new Worker(new URL("../workers/map.worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<number, PendingResolver>();
  let requestId = 1;

  worker.onmessage = (event) => {
    const msg = event.data as {
      requestId: number;
      ok: boolean;
      result?: MapOverviewStats | ExportPayload;
      error?: string;
    };
    const item = pending.get(msg.requestId);
    if (!item) {
      return;
    }
    pending.delete(msg.requestId);
    if (!msg.ok) {
      item.reject(new Error(msg.error ?? "Worker request failed"));
      return;
    }
    item.resolve(msg.result as MapOverviewStats | ExportPayload);
  };

  const call = <T extends MapOverviewStats | ExportPayload>(
    type: "stats" | "export",
    payload: { project: MapProject; format?: ExportFormat },
  ) => {
    const currentId = requestId;
    requestId += 1;
    const safeProject = safeStructuredClone(toRaw(payload.project));
    const safePayload =
      payload.format === undefined ? { project: safeProject } : { project: safeProject, format: payload.format };

    return new Promise<T>((resolve, reject) => {
      pending.set(currentId, {
        resolve: resolve as (value: MapOverviewStats | ExportPayload) => void,
        reject,
      });
      try {
        worker.postMessage({
          requestId: currentId,
          type,
          payload: safePayload,
        });
      } catch (error) {
        pending.delete(currentId);
        reject(error);
      }
    });
  };

  const calcStats = (project: MapProject) =>
    call<MapOverviewStats>("stats", {
      project,
    });

  const exportForRobot = (project: MapProject, format: ExportFormat) =>
    call<ExportPayload>("export", {
      project,
      format,
    });

  const terminate = () => {
    worker.terminate();
    pending.clear();
  };

  return {
    calcStats,
    exportForRobot,
    terminate,
  };
};
