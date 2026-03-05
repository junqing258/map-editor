import { computed, reactive, ref, toRaw, type ComputedRef, type Ref } from "vue";
import {
  createEmptyProject,
  type CellValue,
  type DeviceType,
  type MapDevice,
  type MapProject,
  type PathCheckResult,
  type SceneType,
  type SelectedElement,
  type SupplyMode,
  type ToolOptions,
  type ToolType,
  type UnloadMode,
  type ViewFlags
} from "@/types/map";

const MAX_HISTORY = 100;
const cellIndex = (x: number, y: number, width: number) => y * width + x;
const cloneProject = (source: MapProject): MapProject => structuredClone(toRaw(source));
const ADJACENT_OFF_PLATFORM_TYPES = new Set<DeviceType>(["supply", "unload", "charger"]);

const getDeviceTypeByTool = (tool: ToolType): DeviceType | null => {
  if (tool === "supply") {
    return "supply";
  }
  if (tool === "unload") {
    return "unload";
  }
  if (tool === "charger") {
    return "charger";
  }
  if (tool === "queue") {
    return "queue";
  }
  if (tool === "waiting") {
    return "waiting";
  }
  return null;
};

const createDefaultOptions = (): ToolOptions => ({
  platformMode: "drag",
  batchRows: 10,
  batchCols: 10,
  pathDirection: "oneway",
  supplyMode: "auto",
  unloadMode: "normal"
});

const createDefaultViewFlags = (): ViewFlags => ({
  showGrid: true,
  showPath: true,
  showNavBlock: true
});

const createDeviceConfig = (
  type: DeviceType,
  supplyMode: SupplyMode,
  unloadMode: UnloadMode
): MapDevice["config"] => ({
  enabled: true,
  hardwareId: "",
  speedLimit: 1.2,
  maxQueue: type === "queue" ? 12 : 4,
  directionDeg: 0,
  supplyMode: type === "supply" ? supplyMode : undefined,
  unloadMode: type === "unload" ? unloadMode : undefined
});

const createEditorStoreCore = () => {
  const project = ref<MapProject>(createEmptyProject());
  const activeTool = ref<ToolType>("select");
  const activePathId = ref("path-main");
  const toolOptions = ref<ToolOptions>(createDefaultOptions());
  const viewFlags = ref<ViewFlags>(createDefaultViewFlags());
  const selectedElement = ref<SelectedElement>({ kind: "none" });
  const revision = ref(0);
  const centerSignal = ref(0);

  const past = ref<MapProject[]>([]);
  const future = ref<MapProject[]>([]);
  const actionInProgress = ref(false);
  let actionHasSnapshot = false;

  const width = computed(() => project.value.grid.width);
  const height = computed(() => project.value.grid.height);
  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  const selectedDeviceIds = computed(() => {
    if (selectedElement.value.kind === "device") {
      return [selectedElement.value.deviceId];
    }
    if (selectedElement.value.kind === "device-batch") {
      return selectedElement.value.deviceIds;
    }
    return [];
  });

  const selectedDevices = computed(() =>
    project.value.devices.filter((item) => selectedDeviceIds.value.includes(item.id))
  );

  const singleSelectedDevice = computed(() =>
    selectedDevices.value.length === 1 ? selectedDevices.value[0] : null
  );

  const isCellInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width.value && y < height.value;

  const hasAdjacentPlatform = (x: number, y: number) => {
    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 }
    ];
    return neighbors.some((point) => isCellInside(point.x, point.y) && getCell(point.x, point.y) === 1);
  };

  const canPlaceDeviceAt = (type: DeviceType, x: number, y: number) => {
    if (!isCellInside(x, y)) {
      return false;
    }
    const onPlatform = getCell(x, y) === 1;
    if (ADJACENT_OFF_PLATFORM_TYPES.has(type)) {
      return !onPlatform && hasAdjacentPlatform(x, y);
    }
    return onPlatform;
  };

  const getCell = (x: number, y: number): CellValue => {
    if (!isCellInside(x, y)) {
      return 0;
    }
    return project.value.layers.base[cellIndex(x, y, width.value)];
  };

  const getActivePath = () => {
    const path =
      project.value.overlays.robotPaths.find((item) => item.id === activePathId.value) ??
      project.value.overlays.robotPaths[0];
    return path ?? null;
  };

  const rememberSnapshot = () => {
    if (actionInProgress.value) {
      if (actionHasSnapshot) {
        return;
      }
      actionHasSnapshot = true;
    }
    past.value.push(cloneProject(project.value));
    if (past.value.length > MAX_HISTORY) {
      past.value.shift();
    }
    future.value = [];
  };

  const markChanged = () => {
    project.value.meta.updatedAt = new Date().toISOString();
    revision.value += 1;
  };

  const forceProjectReplace = () => {
    project.value = cloneProject(project.value);
  };

  const beginAction = () => {
    actionInProgress.value = true;
    actionHasSnapshot = false;
  };

  const endAction = () => {
    actionInProgress.value = false;
    actionHasSnapshot = false;
  };

  const selectNone = () => {
    selectedElement.value = { kind: "none" };
  };

  const selectCell = (x: number, y: number) => {
    if (!isCellInside(x, y)) {
      selectNone();
      return;
    }
    selectedElement.value = {
      kind: "cell",
      x,
      y,
      active: getCell(x, y) === 1
    };
  };

  const selectPathPoint = (pathId: string, index: number) => {
    const path = project.value.overlays.robotPaths.find((item) => item.id === pathId);
    if (!path || !path.points[index]) {
      selectNone();
      return;
    }
    const point = path.points[index];
    selectedElement.value = {
      kind: "path-point",
      pathId,
      pathName: path.name,
      index,
      x: point.x,
      y: point.y,
      direction: path.direction
    };
  };

  const selectDevice = (deviceId: string) => {
    selectedElement.value = { kind: "device", deviceId };
  };

  const selectDevicesBatch = (deviceIds: string[]) => {
    if (deviceIds.length <= 1) {
      if (deviceIds.length === 1) {
        selectDevice(deviceIds[0]);
      } else {
        selectNone();
      }
      return;
    }
    selectedElement.value = {
      kind: "device-batch",
      deviceIds
    };
  };

  const setCell = (x: number, y: number, value: CellValue) => {
    if (!isCellInside(x, y)) {
      return false;
    }
    const idx = cellIndex(x, y, width.value);
    if (project.value.layers.base[idx] === value) {
      return false;
    }
    rememberSnapshot();
    project.value.layers.base[idx] = value;
    if (selectedElement.value.kind === "cell" && selectedElement.value.x === x && selectedElement.value.y === y) {
      selectedElement.value.active = value === 1;
    }
    markChanged();
    return true;
  };

  const applyPlatformAt = (x: number, y: number) => setCell(x, y, 1);

  const fillPlatformBatch = (rows: number, cols: number) => {
    const maxRows = Math.max(1, Math.floor(rows));
    const maxCols = Math.max(1, Math.floor(cols));
    rememberSnapshot();
    let changed = false;
    for (let y = 0; y < Math.min(height.value, maxRows); y += 1) {
      for (let x = 0; x < Math.min(width.value, maxCols); x += 1) {
        const idx = cellIndex(x, y, width.value);
        if (project.value.layers.base[idx] === 0) {
          project.value.layers.base[idx] = 1;
          changed = true;
        }
      }
    }
    if (!changed) {
      return false;
    }
    markChanged();
    forceProjectReplace();
    return true;
  };

  const addPathPoint = (x: number, y: number) => {
    if (!isCellInside(x, y) || getCell(x, y) === 0) {
      return -1;
    }
    const path = getActivePath();
    if (!path) {
      return -1;
    }

    let snapshotTaken = false;
    if (path.direction !== toolOptions.value.pathDirection) {
      rememberSnapshot();
      snapshotTaken = true;
      path.direction = toolOptions.value.pathDirection;
    }

    const existing = path.points.findIndex((item) => item.x === x && item.y === y);
    if (existing >= 0) {
      if (snapshotTaken) {
        markChanged();
      }
      selectPathPoint(path.id, existing);
      return existing;
    }

    const prev = path.points[path.points.length - 1];
    if (prev && prev.x === x && prev.y === y) {
      selectPathPoint(path.id, path.points.length - 1);
      return path.points.length - 1;
    }

    if (!snapshotTaken) {
      rememberSnapshot();
    }
    path.points.push({ x, y });
    const index = path.points.length - 1;
    selectPathPoint(path.id, index);
    markChanged();
    return index;
  };

  const erasePathPointAt = (x: number, y: number) => {
    const path = getActivePath();
    if (!path || path.points.length === 0) {
      return false;
    }
    const next = path.points.filter((point) => !(point.x === x && point.y === y));
    if (next.length === path.points.length) {
      return false;
    }
    rememberSnapshot();
    path.points = next;
    if (selectedElement.value.kind === "path-point" && selectedElement.value.x === x && selectedElement.value.y === y) {
      selectNone();
    }
    markChanged();
    return true;
  };

  const clearPath = () => {
    const path = getActivePath();
    if (!path || path.points.length === 0) {
      return false;
    }
    rememberSnapshot();
    path.points = [];
    selectNone();
    markChanged();
    return true;
  };

  const createDeviceName = (type: DeviceType) => {
    const count = project.value.devices.filter((item) => item.type === type).length + 1;
    return `${type}-${String(count).padStart(2, "0")}`;
  };

  const placeDeviceByTool = (tool: ToolType, x: number, y: number) => {
    const type = getDeviceTypeByTool(tool);
    if (!type || !canPlaceDeviceAt(type, x, y)) {
      return false;
    }
    const existing = project.value.devices.find((item) => item.x === x && item.y === y);
    if (existing && existing.type === type) {
      selectDevice(existing.id);
      return false;
    }

    rememberSnapshot();
    if (existing) {
      existing.type = type;
      existing.name = createDeviceName(type);
      existing.config = createDeviceConfig(
        type,
        toolOptions.value.supplyMode,
        toolOptions.value.unloadMode
      );
      selectDevice(existing.id);
      markChanged();
      return true;
    }

    const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    project.value.devices.push({
      id,
      type,
      name: createDeviceName(type),
      x,
      y,
      config: createDeviceConfig(
        type,
        toolOptions.value.supplyMode,
        toolOptions.value.unloadMode
      )
    });
    selectDevice(id);
    markChanged();
    return true;
  };

  const selectByCell = (x: number, y: number) => {
    if (!isCellInside(x, y)) {
      selectNone();
      return;
    }
    const device = project.value.devices.find((item) => item.x === x && item.y === y);
    if (device) {
      selectDevice(device.id);
      return;
    }
    for (const path of project.value.overlays.robotPaths) {
      const index = path.points.findIndex((item) => item.x === x && item.y === y);
      if (index >= 0) {
        selectPathPoint(path.id, index);
        return;
      }
    }
    selectCell(x, y);
  };

  const selectDevicesInRect = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const ids = project.value.devices
      .filter((item) => item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY)
      .map((item) => item.id);
    selectDevicesBatch(ids);
  };

  const updateSingleDevice = (patch: {
    name?: string;
    enabled?: boolean;
    hardwareId?: string;
    speedLimit?: number;
    maxQueue?: number;
    directionDeg?: number;
    supplyMode?: SupplyMode;
    unloadMode?: UnloadMode;
  }) => {
    const device = singleSelectedDevice.value;
    if (!device) {
      return false;
    }
    rememberSnapshot();
    if (patch.name !== undefined) {
      device.name = patch.name;
    }
    if (patch.enabled !== undefined) {
      device.config.enabled = patch.enabled;
    }
    if (patch.hardwareId !== undefined) {
      device.config.hardwareId = patch.hardwareId;
    }
    if (patch.speedLimit !== undefined) {
      device.config.speedLimit = patch.speedLimit;
    }
    if (patch.maxQueue !== undefined) {
      device.config.maxQueue = patch.maxQueue;
    }
    if (patch.directionDeg !== undefined) {
      device.config.directionDeg = patch.directionDeg;
    }
    if (patch.supplyMode !== undefined) {
      device.config.supplyMode = patch.supplyMode;
    }
    if (patch.unloadMode !== undefined) {
      device.config.unloadMode = patch.unloadMode;
    }
    markChanged();
    return true;
  };

  const applyBatchDevicePatch = (patch: {
    enabled?: boolean;
    speedLimit?: number;
    prefix?: string;
  }) => {
    if (selectedElement.value.kind !== "device-batch" || selectedElement.value.deviceIds.length === 0) {
      return 0;
    }
    rememberSnapshot();
    let changed = 0;
    selectedElement.value.deviceIds.forEach((id, index) => {
      const device = project.value.devices.find((item) => item.id === id);
      if (!device) {
        return;
      }
      if (patch.enabled !== undefined) {
        device.config.enabled = patch.enabled;
      }
      if (patch.speedLimit !== undefined) {
        device.config.speedLimit = patch.speedLimit;
      }
      if (patch.prefix) {
        device.name = `${patch.prefix}-${index + 1}`;
      }
      changed += 1;
    });
    if (changed > 0) {
      markChanged();
    }
    return changed;
  };

  const deleteSelectedElement = () => {
    if (selectedElement.value.kind === "none") {
      return false;
    }

    if (selectedElement.value.kind === "cell") {
      if (!selectedElement.value.active) {
        return false;
      }
      return setCell(selectedElement.value.x, selectedElement.value.y, 0);
    }

    if (selectedElement.value.kind === "path-point") {
      const { pathId, index } = selectedElement.value;
      const path = project.value.overlays.robotPaths.find((item) => item.id === pathId);
      if (!path || !path.points[index]) {
        selectNone();
        return false;
      }
      rememberSnapshot();
      path.points.splice(index, 1);
      selectNone();
      markChanged();
      return true;
    }

    const ids =
      selectedElement.value.kind === "device"
        ? [selectedElement.value.deviceId]
        : selectedElement.value.deviceIds;
    if (ids.length === 0) {
      return false;
    }

    const idSet = new Set(ids);
    const next = project.value.devices.filter((item) => !idSet.has(item.id));
    if (next.length === project.value.devices.length) {
      selectNone();
      return false;
    }

    rememberSnapshot();
    project.value.devices = next;
    selectNone();
    markChanged();
    return true;
  };

  const clearSelection = () => {
    selectNone();
  };

  const setViewFlag = (key: keyof ViewFlags, value?: boolean) => {
    if (value === undefined) {
      viewFlags.value[key] = !viewFlags.value[key];
      return;
    }
    viewFlags.value[key] = value;
  };

  const setTool = (tool: ToolType) => {
    activeTool.value = tool;
  };

  const requestCenterView = () => {
    centerSignal.value += 1;
  };

  const resetMapData = () => {
    rememberSnapshot();
    const { width: w, height: h, cellSizeMeter, chunkSize } = project.value.grid;
    const next = createEmptyProject(w, h, project.value.meta.scene, project.value.meta.name);
    next.meta.tags = [...project.value.meta.tags];
    next.grid.cellSizeMeter = cellSizeMeter;
    next.grid.chunkSize = chunkSize;
    project.value = next;
    selectNone();
    revision.value += 1;
  };

  const createNewMap = (payload: {
    name: string;
    width: number;
    height: number;
    scene: SceneType;
    tags: string[];
  }) => {
    rememberSnapshot();
    const next = createEmptyProject(
      Math.max(8, Math.floor(payload.width)),
      Math.max(8, Math.floor(payload.height)),
      payload.scene,
      payload.name.trim() || "factory-map"
    );
    next.meta.tags = payload.tags.filter(Boolean);
    project.value = next;
    toolOptions.value = createDefaultOptions();
    selectNone();
    revision.value += 1;
  };

  const resetProject = (next?: MapProject) => {
    rememberSnapshot();
    project.value = next ?? createEmptyProject();
    selectNone();
    revision.value += 1;
  };

  const touch = () => {
    markChanged();
  };

  const runPathCheck = (): PathCheckResult => {
    const issues: string[] = [];
    const nodeCount = project.value.layers.base.reduce<number>(
      (acc, item) => (item === 1 ? acc + 1 : acc),
      0
    );
    if (nodeCount === 0) {
      issues.push("未绘制钢平台，无法运行路径。");
    }
    project.value.overlays.robotPaths.forEach((path) => {
      if (path.points.length < 2) {
        issues.push(`路径 ${path.name} 点位少于 2 个。`);
        return;
      }
      for (let i = 0; i < path.points.length; i += 1) {
        const point = path.points[i];
        if (!isCellInside(point.x, point.y) || getCell(point.x, point.y) === 0) {
          issues.push(`路径 ${path.name} 含无效点位 (${point.x}, ${point.y})。`);
          break;
        }
        if (i > 0) {
          const prev = path.points[i - 1];
          const manhattan = Math.abs(prev.x - point.x) + Math.abs(prev.y - point.y);
          if (manhattan !== 1) {
            issues.push(
              `路径 ${path.name} 存在非邻接连接 (${prev.x}, ${prev.y}) -> (${point.x}, ${point.y})。`
            );
            break;
          }
        }
      }
    });
    project.value.devices.forEach((device) => {
      if (ADJACENT_OFF_PLATFORM_TYPES.has(device.type)) {
        if (getCell(device.x, device.y) === 1 || !hasAdjacentPlatform(device.x, device.y)) {
          issues.push(`设备 ${device.name} 需放置在钢平台邻格且不能压在钢平台上。`);
        }
        return;
      }
      if (getCell(device.x, device.y) === 0) {
        issues.push(`设备 ${device.name} 未放置在钢平台上。`);
      }
    });
    return {
      ok: issues.length === 0,
      issues
    };
  };

  const undo = () => {
    const snapshot = past.value.pop();
    if (!snapshot) {
      return false;
    }
    future.value.push(cloneProject(project.value));
    project.value = snapshot;
    selectNone();
    revision.value += 1;
    return true;
  };

  const redo = () => {
    const snapshot = future.value.pop();
    if (!snapshot) {
      return false;
    }
    past.value.push(cloneProject(project.value));
    project.value = snapshot;
    selectNone();
    revision.value += 1;
    return true;
  };

  return {
    project,
    activeTool,
    activePathId,
    toolOptions,
    viewFlags,
    selectedElement,
    selectedDeviceIds,
    selectedDevices,
    singleSelectedDevice,
    revision,
    centerSignal,
    width,
    height,
    canUndo,
    canRedo,
    beginAction,
    endAction,
    setTool,
    setViewFlag,
    requestCenterView,
    getCell,
    setCell,
    applyPlatformAt,
    fillPlatformBatch,
    addPathPoint,
    erasePathPointAt,
    clearPath,
    placeDeviceByTool,
    selectByCell,
    selectDevicesInRect,
    selectNone,
    clearSelection,
    deleteSelectedElement,
    updateSingleDevice,
    applyBatchDevicePatch,
    selectPathPoint,
    selectCell,
    resetMapData,
    createNewMap,
    resetProject,
    runPathCheck,
    touch,
    undo,
    redo
  };
};

type MaybeRef<T> = T extends Ref<infer V> ? V : T extends ComputedRef<infer V> ? V : T;
type UnwrappedStore<T extends Record<string, unknown>> = {
  [K in keyof T]: MaybeRef<T[K]>;
};

export type EditorStore = UnwrappedStore<ReturnType<typeof createEditorStoreCore>>;

export const createEditorStore = (): EditorStore =>
  reactive(createEditorStoreCore()) as EditorStore;

let sharedEditorStore: EditorStore | null = null;

export const useEditorStore = (): EditorStore => {
  if (!sharedEditorStore) {
    sharedEditorStore = createEditorStore();
  }
  return sharedEditorStore;
};
