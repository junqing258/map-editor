import localforage from "localforage";

import type { MapProject } from "@/types/map";
import { parseProjectJson } from "@/utils/projectIO";

const CACHE_PREFIX = "map-project:";

const projectCache = localforage.createInstance({
  name: "industrial-grid-map-editor",
  storeName: "map_project_cache",
});

const buildCacheKey = (mapId: string) => `${CACHE_PREFIX}${mapId}`;

export const saveCachedMapProject = async (project: MapProject) => {
  await projectCache.setItem(buildCacheKey(project.meta.id), JSON.stringify(project));
};

export const loadCachedMapProject = async (mapId: string): Promise<MapProject | null> => {
  const raw = await projectCache.getItem<string>(buildCacheKey(mapId));
  if (!raw) {
    return null;
  }

  try {
    return parseProjectJson(raw);
  } catch (error) {
    console.warn(`Failed to restore cached map project: ${mapId}`, error);
    await projectCache.removeItem(buildCacheKey(mapId));
    return null;
  }
};
