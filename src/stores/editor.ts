import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import {
  createEmptyProject,
  type CellValue,
  type MapProject,
  type SelectedElement,
  type ToolType
} from "@/types/map";

const cellIndex = (x: number, y: number, width: number) => y * width + x;
// 撤销栈最大长度，避免长时间编辑导致内存无限增长
const MAX_HISTORY = 80;

// 深拷贝工程快照，用于 undo/redo
const cloneProject = (source: MapProject): MapProject => structuredClone(toRaw(source));

export const useEditorStore = defineStore("editor", () => {
  const project = ref<MapProject>(createEmptyProject());
  const activeTool = ref<ToolType>("obstacle");
  const activePathId = ref("path-main");
  // 当前在属性面板显示的选中对象
  const selectedElement = ref<SelectedElement>({ kind: "none" });
  // 变更版本号，供视图层 watch 触发刷新
  const revision = ref(0);
  // 历史栈：past 用于撤销，future 用于重做
  const past = ref<MapProject[]>([]);
  const future = ref<MapProject[]>([]);
  // 将一次拖拽绘制归并为一个历史动作
  const actionInProgress = ref(false);
  let actionHasSnapshot = false;

  const width = computed(() => project.value.grid.width);
  const height = computed(() => project.value.grid.height);
  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  const isCellInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width.value && y < height.value;

  const getActivePath = () =>
    project.value.overlays.robotPaths.find((item) => item.id === activePathId.value);

  // 记录当前工程快照到撤销栈；动作进行中仅记录一次
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

  // Action 包裹用于把连续修改合并成一次撤销
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
      value: getCell(x, y)
    };
  };

  const selectPathPoint = (pathId: string, index: number) => {
    const path = project.value.overlays.robotPaths.find((item) => item.id === pathId);
    if (!path) {
      selectNone();
      return;
    }
    const point = path.points[index];
    if (!point) {
      selectNone();
      return;
    }
    selectedElement.value = {
      kind: "path-point",
      pathId: path.id,
      pathName: path.name,
      index,
      x: point.x,
      y: point.y,
      color: path.color
    };
  };

  const getCell = (x: number, y: number): CellValue => {
    if (!isCellInside(x, y)) {
      return 0;
    }
    const idx = cellIndex(x, y, width.value);
    return project.value.layers.base[idx];
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
    // 若当前已选中该格子，实时同步属性面板值
    if (selectedElement.value.kind === "cell" && selectedElement.value.x === x && selectedElement.value.y === y) {
      selectedElement.value.value = value;
    }
    markChanged();
    return true;
  };

  const applyToolAt = (x: number, y: number) => {
    if (activeTool.value === "obstacle") {
      return setCell(x, y, 1);
    }
    if (activeTool.value === "erase") {
      return setCell(x, y, 0);
    }
    return false;
  };

  const addPathPoint = (x: number, y: number) => {
    if (!isCellInside(x, y)) {
      return -1;
    }
    const path = getActivePath();
    if (!path) {
      return -1;
    }
    const existingIndex = path.points.findIndex((point) => point.x === x && point.y === y);
    if (existingIndex >= 0) {
      // 点击已有点时直接转为选中，不重复插入
      selectPathPoint(path.id, existingIndex);
      return existingIndex;
    }
    rememberSnapshot();
    path.points.push({ x, y });
    const index = path.points.length - 1;
    selectPathPoint(path.id, index);
    markChanged();
    return index;
  };

  const clearPath = () => {
    const path = getActivePath();
    if (!path) {
      return;
    }
    if (path.points.length === 0) {
      return;
    }
    rememberSnapshot();
    path.points = [];
    selectNone();
    markChanged();
  };

  const resetProject = (next?: MapProject) => {
    // 导入/新建也纳入可撤销历史
    rememberSnapshot();
    project.value = next ?? createEmptyProject();
    selectNone();
    revision.value += 1;
  };

  const touch = () => {
    markChanged();
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
    selectedElement,
    revision,
    canUndo,
    canRedo,
    width,
    height,
    beginAction,
    endAction,
    selectNone,
    selectCell,
    selectPathPoint,
    getCell,
    applyToolAt,
    setCell,
    addPathPoint,
    clearPath,
    resetProject,
    touch,
    undo,
    redo
  };
});
