import localforage from "localforage";

import type { MapProject } from "@/types/map";
import { parseProjectJson } from "@/utils/projectIO";
import { safeStructuredClone } from "@/utils/safeClone";

const CACHE_PREFIX = "map-project:";
const LIBRARY_PREFIX = "map-library:";

const projectCache = localforage.createInstance({
  name: "industrial-grid-map-editor",
  storeName: "map_project_cache",
});

const libraryCache = localforage.createInstance({
  name: "industrial-grid-map-editor",
  storeName: "map_library_cache",
});

const buildCacheKey = (mapId: string) => `${CACHE_PREFIX}${mapId}`;
const buildLibraryKey = (libraryId: string) => `${LIBRARY_PREFIX}${libraryId}`;

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

export const loadCachedLibraryItems = async <T>(libraryId: string): Promise<T[]> => {
  const cacheKey = buildLibraryKey(libraryId);
  const cached = await libraryCache.getItem<T[]>(cacheKey);
  return Array.isArray(cached) ? cached : [];
};

export const saveCachedLibraryItems = async <T>(libraryId: string, items: T[]) => {
  await libraryCache.setItem(buildLibraryKey(libraryId), safeStructuredClone(items));
};
