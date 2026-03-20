export const mapPalette = {
  brand: {
    solid: "#2ec6d6",
    hover: "#25b7c6",
    soft: "#d7f5f8",
    border: "#8be1eb",
    text: "#0f5a63",
  },
  success: {
    solid: "#10b981",
    soft: "#d1fae5",
    text: "#ffffff",
  },
  danger: {
    solid: "#f43f5e",
    hover: "#e11d48",
    soft: "#ffe4e6",
    text: "#ffffff",
  },
  warning: {
    solid: "#c2410c",
    soft: "#ffedd5",
    text: "#c2410c",
  },
  info: {
    solid: "#1d4ed8",
    soft: "#dbeafe",
    text: "#1d4ed8",
  },
  muted: {
    soft: "#f1f5f9",
    border: "#cbd5e1",
    text: "#64748b",
    strong: "#475569",
  },
  canvas: {
    background: "#f8fafc",
    grid: "#cad4e2",
    platformFill: "#e2e8f0",
    platformStroke: "#cbd5e1",
  },
} as const;

export const DEVICE_COLOR_MAP = {
  supply: mapPalette.success.solid,
  unload: mapPalette.warning.solid,
  charger: mapPalette.info.solid,
} as const;

export const CELL_FILL_COLOR_MAP = {
  1: mapPalette.canvas.platformFill,
  2: mapPalette.warning.soft,
  3: mapPalette.info.soft,
} as const;

export const CELL_STROKE_COLOR_MAP = {
  1: mapPalette.canvas.platformStroke,
  2: mapPalette.warning.text,
  3: mapPalette.info.text,
} as const;

export const PANEL_COLOR_MAP = {
  "2x4": {
    fill: mapPalette.warning.soft,
    stroke: mapPalette.warning.text,
  },
  "1x2": {
    fill: mapPalette.success.soft,
    stroke: mapPalette.success.solid,
  },
} as const;

export const PATH_COLOR_PALETTE = [
  mapPalette.brand.solid,
  mapPalette.info.solid,
  mapPalette.success.solid,
  mapPalette.warning.solid,
  mapPalette.danger.solid,
  mapPalette.muted.strong,
] as const;
