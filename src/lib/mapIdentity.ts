const MAP_ID_MAX_LENGTH = 64;

const collapseHyphens = (value: string) => value.replace(/-+/g, "-").replace(/^-|-$/g, "");

export const normalizeMapId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = collapseHyphens(value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-")).slice(0, MAP_ID_MAX_LENGTH);
  return normalized.length > 0 ? normalized : null;
};

export const createMapId = (name = "factory-map"): string => {
  const base = normalizeMapId(name) ?? "map";
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return collapseHyphens(`${base}_${suffix}`).slice(0, MAP_ID_MAX_LENGTH);
};

export const resolveMapId = (value: unknown, fallbackName = "factory-map"): string =>
  normalizeMapId(value) ?? createMapId(fallbackName);
