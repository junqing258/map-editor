import localforage from "localforage";

import type { MapProject } from "@/types/map";
import { parseProjectJson } from "@/utils/projectIO";
import { safeStructuredClone } from "@/utils/safeClone";

const CACHE_PREFIX = "map-project:";
const LIBRARY_PREFIX = "map-library:";
const LAST_MAP_ID_KEY = "map-project:last-id";

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
  const serializedProject = JSON.stringify(project);
  await projectCache.setItem(buildCacheKey(project.meta.id), serializedProject);
  await projectCache.setItem(LAST_MAP_ID_KEY, project.meta.id);
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

export const loadLatestCachedMapProject = async (): Promise<MapProject | null> => {
  const latestMapId = await projectCache.getItem<string>(LAST_MAP_ID_KEY);
  if (!latestMapId) {
    return null;
  }

  const project = await loadCachedMapProject(latestMapId);
  if (!project) {
    await projectCache.removeItem(LAST_MAP_ID_KEY);
    return null;
  }

  return project;
};

export const loadCachedLibraryItems = async <T>(libraryId: string): Promise<T[]> => {
  const cacheKey = buildLibraryKey(libraryId);
  const cached = await libraryCache.getItem<T[]>(cacheKey);
  return Array.isArray(cached) ? cached : [];
};

export const saveCachedLibraryItems = async <T>(libraryId: string, items: T[]) => {
  await libraryCache.setItem(buildLibraryKey(libraryId), safeStructuredClone(items));
};
