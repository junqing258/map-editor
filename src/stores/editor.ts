import { computed, reactive, ref, toRaw, type ComputedRef, type Ref } from "vue";
import {
  createEmptyProject,
  type CellCoord,
  type CellValue,
  type DeviceType,
  type MapDevice,
  type MapProject,
  type PathCheckResult,
  type SceneType,
  type SelectedElement,
  type SelectedPathPointRef,
  type SupplyMode,
  type ToolOptions,
  type ToolType,
  type UnloadMode,
  type ViewFlags
} from "@/types/map";

const MAX_HISTORY = 100;
const cellIndex = (x: number, y: number, width: number) => y * width + x;
// 统一深拷贝入口：优先 structuredClone，失败时回退到可容错的 JSON 方案。
const cloneProject = (source: MapProject): MapProject => {
  const raw = toRaw(source);
  const seen = new WeakSet<object>();
  const json = JSON.stringify(raw, (_key, value) => {
    if (typeof value === "function") {
      return undefined;
    }
    if (typeof value === "object" && value !== null) {
      if (typeof Window !== "undefined" && value instanceof Window) {
        return undefined;
      }
      if (typeof Element !== "undefined" && value instanceof Element) {
        return undefined;
      }
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }
    return value;
  });
  if (!json) {
    return createEmptyProject();
  }
  return JSON.parse(json) as MapProject;
};

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
  return null;
};

const getPlatformStateByTool = (tool: ToolType): CellValue | null => {
  if (tool === "platform") {
    return 1;
  }
  if (tool === "queue") {
    return 2;
  }
  if (tool === "waiting") {
    return 3;
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
  maxQueue: 4,
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
    if (selectedElement.value.kind === "device-batch" || selectedElement.value.kind === "mixed-batch") {
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
    return neighbors.some((point) => isCellInside(point.x, point.y) && getCell(point.x, point.y) > 0);
  };

  const canPlaceDeviceAt = (type: DeviceType, x: number, y: number) => {
    if (!isCellInside(x, y)) {
      return false;
    }
    const onPlatform = getCell(x, y) > 0;
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

  // 拖拽绘制期间只保留一次快照，避免一个手势产生大量撤销节点。
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

  // 用深拷贝触发引用变更，确保依赖浅比较的订阅方能收到更新。
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
      active: getCell(x, y) > 0
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
      selectedElement.value.active = value > 0;
    }
    markChanged();
    return true;
  };

  const applyPlatformAt = (x: number, y: number) => setCell(x, y, 1);
  const applyPlatformStateByTool = (tool: ToolType, x: number, y: number) => {
    const value = getPlatformStateByTool(tool);
    if (value === null) {
      return false;
    }
    if (value === 1) {
      return applyPlatformAt(x, y);
    }
    // 队列区/等待区必须附着在已有平台上。
    if (!isCellInside(x, y) || getCell(x, y) === 0) {
      return false;
    }
    return setCell(x, y, value);
  };

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
    // 批量写入后强制替换引用，避免外层组件错过数组原位修改。
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

    // 方向切换也属于路径编辑，需要先记录一次快照。
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

  const selectElementsInRect = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(width.value - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(height.value - 1, Math.max(y1, y2));
    const deviceIds = project.value.devices
      .filter((item) => item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY)
      .sort((a, b) => {
        if (a.y !== b.y) {
          return a.y - b.y;
        }
        if (a.x !== b.x) {
          return a.x - b.x;
        }
        return a.id.localeCompare(b.id);
      })
      .map((item) => item.id);

    const cells: CellCoord[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (getCell(x, y) > 0) {
          cells.push({ x, y });
        }
      }
    }

    const pathPoints: SelectedPathPointRef[] = [];
    for (const path of project.value.overlays.robotPaths) {
      path.points.forEach((point, index) => {
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          pathPoints.push({
            pathId: path.id,
            index,
            x: point.x,
            y: point.y
          });
        }
      });
    }
    pathPoints.sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      if (a.x !== b.x) {
        return a.x - b.x;
      }
      if (a.pathId !== b.pathId) {
        return a.pathId.localeCompare(b.pathId);
      }
      return a.index - b.index;
    });

    // 根据命中数量回退到最具体的单选类型，保证属性面板行为一致。
    const total = deviceIds.length + cells.length + pathPoints.length;
    if (total === 0) {
      selectNone();
      return;
    }
    if (deviceIds.length === 1 && cells.length === 0 && pathPoints.length === 0) {
      selectDevice(deviceIds[0]);
      return;
    }
    if (deviceIds.length === 0 && cells.length === 1 && pathPoints.length === 0) {
      selectCell(cells[0].x, cells[0].y);
      return;
    }
    if (deviceIds.length === 0 && cells.length === 0 && pathPoints.length === 1) {
      const point = pathPoints[0];
      selectPathPoint(point.pathId, point.index);
      return;
    }
    if (cells.length === 0 && pathPoints.length === 0) {
      selectDevicesBatch(deviceIds);
      return;
    }

    selectedElement.value = {
      kind: "mixed-batch",
      deviceIds,
      cells,
      pathPoints
    };
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

    if (selectedElement.value.kind === "mixed-batch") {
      const { deviceIds, cells, pathPoints } = selectedElement.value;
      let changed = false;

      if (deviceIds.length > 0) {
        const idSet = new Set(deviceIds);
        const next = project.value.devices.filter((item) => !idSet.has(item.id));
        if (next.length !== project.value.devices.length) {
          rememberSnapshot();
          project.value.devices = next;
          changed = true;
        }
      }

      if (cells.length > 0) {
        const base = project.value.layers.base;
        for (const cell of cells) {
          if (!isCellInside(cell.x, cell.y)) {
            continue;
          }
          const idx = cellIndex(cell.x, cell.y, width.value);
          if (base[idx] === 0) {
            continue;
          }
          if (!changed) {
            rememberSnapshot();
          }
          base[idx] = 0;
          changed = true;
        }
      }

      if (pathPoints.length > 0) {
        // 同一路径按索引倒序删除，避免前删后导致索引偏移。
        const grouped = new Map<string, number[]>();
        pathPoints.forEach((item) => {
          const list = grouped.get(item.pathId) ?? [];
          list.push(item.index);
          grouped.set(item.pathId, list);
        });
        grouped.forEach((indices, pathId) => {
          const path = project.value.overlays.robotPaths.find((item) => item.id === pathId);
          if (!path) {
            return;
          }
          indices
            .sort((a, b) => b - a)
            .forEach((index) => {
              if (!path.points[index]) {
                return;
              }
              if (!changed) {
                rememberSnapshot();
              }
              path.points.splice(index, 1);
              changed = true;
            });
        });
      }

      selectNone();
      if (changed) {
        markChanged();
      }
      return changed;
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
    // 校验范围：平台可用性、路径连续性、设备摆放规则。
    const nodeCount = project.value.layers.base.reduce<number>(
      (acc, item) => (item > 0 ? acc + 1 : acc),
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
        if (getCell(device.x, device.y) > 0 || !hasAdjacentPlatform(device.x, device.y)) {
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
    applyPlatformStateByTool,
    fillPlatformBatch,
    addPathPoint,
    erasePathPointAt,
    clearPath,
    placeDeviceByTool,
    selectByCell,
    selectElementsInRect,
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
