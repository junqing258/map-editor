<template>
  <div ref="hostRef" class="map-canvas" :style="{ cursor: canvasCursor }" @contextmenu.prevent>
    <div v-if="selectionBox.visible" class="map-select-rect" :style="selectionBoxStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import type { MapProject, SelectedElement, ToolType, ViewFlags } from "@/types/map";

import { EditorStore } from "./editorStore";
import { GridRenderer } from "./gridRenderer";

/* interface MapEditorCanvasStore {
  activeTool: ToolType;
  project: MapProject;
  viewFlags: ViewFlags;
  selectedElement: SelectedElement;
  centerSignal: number;
  beginAction: () => void;
  endAction: () => void;
  applyPlatformAt: (x: number, y: number) => boolean;
  applyPlatformStateByTool: (tool: ToolType, x: number, y: number) => boolean;
  addPathPoint: (x: number, y: number) => number;
  erasePathPointAt: (x: number, y: number) => boolean;
  placeDeviceByTool: (tool: ToolType, x: number, y: number) => boolean;
  selectByCell: (x: number, y: number) => void;
  selectElementsInRect: (x1: number, y1: number, x2: number, y2: number) => void;
}
 */
const props = defineProps<{
  store: EditorStore;
}>();

const store = props.store;
const hostRef = ref<HTMLElement | null>(null);

let renderer: GridRenderer | null = null;
// 手势状态：同一时刻只允许一种主交互（绘制/平移/框选）。
let painting = false;
let panning = false;
let selecting = false;
let selectionMoved = false;
let selectStartCell = { x: 0, y: 0 };
let selectStartPointer = { x: 0, y: 0 };
let lastPointer = { x: 0, y: 0 };
const hoverCell = reactive({
  active: false,
  x: 0,
  y: 0,
});
const canvasCursor = ref("default");

const selectionBox = reactive({
  visible: false,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});

const selectionBoxStyle = computed(() => ({
  left: `${selectionBox.left}px`,
  top: `${selectionBox.top}px`,
  width: `${selectionBox.width}px`,
  height: `${selectionBox.height}px`,
}));

const isDeviceTool = () =>
  store.activeTool === "supply" || store.activeTool === "unload" || store.activeTool === "charger";

const isPlatformStateTool = () =>
  store.activeTool === "platform" || store.activeTool === "queue" || store.activeTool === "waiting";

const isPlacementTool = () => isPlatformStateTool() || isDeviceTool();

const setHoverCellByClient = (clientX: number, clientY: number) => {
  if (!renderer || !hostRef.value) {
    hoverCell.active = false;
    syncCanvasCursor();
    return;
  }
  const rect = hostRef.value.getBoundingClientRect();
  const inside =
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (!inside) {
    hoverCell.active = false;
    syncCanvasCursor();
    return;
  }
  const { x, y } = renderer.screenToCell(clientX, clientY);
  hoverCell.active = true;
  hoverCell.x = x;
  hoverCell.y = y;
  syncCanvasCursor();
};

const syncCanvasCursor = () => {
  if (panning) {
    canvasCursor.value = "grabbing";
    return;
  }
  if (store.activeTool === "select") {
    canvasCursor.value = selecting ? "crosshair" : "default";
    return;
  }
  if (isPlacementTool()) {
    if (!hoverCell.active) {
      canvasCursor.value = "crosshair";
      return;
    }
    canvasCursor.value = store.canApplyToolAt(store.activeTool, hoverCell.x, hoverCell.y) ? "copy" : "not-allowed";
    return;
  }
  if (store.activeTool === "path-draw" || store.activeTool === "path-erase") {
    canvasCursor.value = "crosshair";
    return;
  }
  canvasCursor.value = "default";
};

const updateSelectionBox = (clientX: number, clientY: number) => {
  if (!hostRef.value) {
    return;
  }
  const rect = hostRef.value.getBoundingClientRect();
  const x1 = selectStartPointer.x - rect.left;
  const y1 = selectStartPointer.y - rect.top;
  const x2 = clientX - rect.left;
  const y2 = clientY - rect.top;
  selectionBox.left = Math.min(x1, x2);
  selectionBox.top = Math.min(y1, y2);
  selectionBox.width = Math.abs(x1 - x2);
  selectionBox.height = Math.abs(y1 - y2);
};

const hideSelectionBox = () => {
  selectionBox.visible = false;
  selectionBox.left = 0;
  selectionBox.top = 0;
  selectionBox.width = 0;
  selectionBox.height = 0;
};

const applyToolAt = (clientX: number, clientY: number) => {
  if (!renderer) {
    return;
  }
  // 所有工具统一先做坐标换算，再按当前工具分发行为。
  const { x, y } = renderer.screenToCell(clientX, clientY);

  if (isPlatformStateTool()) {
    const changed = store.applyPlatformStateByTool(store.activeTool, x, y);
    if (changed) {
      renderer.updateChunkByCell(x, y);
    }
    syncCanvasCursor();
    return;
  }

  if (store.activeTool === "path-draw") {
    const index = store.addPathPoint(x, y);
    if (index >= 0) {
      renderer.redrawPaths(store.project.overlays.robotPaths);
    }
    syncCanvasCursor();
    return;
  }

  if (store.activeTool === "path-erase") {
    const changed = store.erasePathPointAt(x, y);
    if (changed) {
      renderer.redrawPaths(store.project.overlays.robotPaths);
    }
    syncCanvasCursor();
    return;
  }

  if (isDeviceTool()) {
    const changed = store.placeDeviceByTool(store.activeTool, x, y);
    if (changed) {
      renderer.redrawDevices(store.project.devices);
    }
    syncCanvasCursor();
    return;
  }

  store.selectByCell(x, y);
  syncCanvasCursor();
};

const onPointerDown = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  setHoverCellByClient(event.clientX, event.clientY);
  lastPointer = { x: event.clientX, y: event.clientY };

  if (event.button === 1 || event.button === 2) {
    // 中键/右键始终进入平移，避免和编辑工具冲突。
    panning = true;
    syncCanvasCursor();
    return;
  }
  if (event.button !== 0) {
    return;
  }

  if (store.activeTool === "select") {
    selecting = true;
    selectionMoved = false;
    selectStartPointer = { x: event.clientX, y: event.clientY };
    selectStartCell = renderer.screenToCell(event.clientX, event.clientY);
    hideSelectionBox();
    syncCanvasCursor();
    return;
  }

  if (isDeviceTool()) {
    // 设备工具是单点放置，不走 begin/endAction 批量快照流程。
    applyToolAt(event.clientX, event.clientY);
    return;
  }

  store.beginAction();
  painting = true;
  syncCanvasCursor();
  applyToolAt(event.clientX, event.clientY);
};

const onPointerMove = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  setHoverCellByClient(event.clientX, event.clientY);
  if (panning) {
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    renderer.panBy(dx, dy);
    lastPointer = { x: event.clientX, y: event.clientY };
    syncCanvasCursor();
    return;
  }

  if (selecting) {
    const deltaX = Math.abs(event.clientX - selectStartPointer.x);
    const deltaY = Math.abs(event.clientY - selectStartPointer.y);
    // 小范围抖动按点击处理，超过阈值再进入框选。
    if (deltaX > 4 || deltaY > 4) {
      selectionMoved = true;
      selectionBox.visible = true;
      updateSelectionBox(event.clientX, event.clientY);
      const current = renderer.screenToCell(event.clientX, event.clientY);
      store.selectElementsInRect(selectStartCell.x, selectStartCell.y, current.x, current.y);
    }
    return;
  }

  if (!painting || (event.buttons & 1) === 0) {
    return;
  }
  applyToolAt(event.clientX, event.clientY);
};

const stopGesture = (event?: PointerEvent) => {
  if (panning) {
    panning = false;
  }

  if (selecting && renderer) {
    const endPoint = event
      ? renderer.screenToCell(event.clientX, event.clientY)
      : renderer.screenToCell(lastPointer.x, lastPointer.y);
    if (selectionMoved && selectionBox.visible) {
      store.selectElementsInRect(selectStartCell.x, selectStartCell.y, endPoint.x, endPoint.y);
    } else {
      // 没有拖出框选时回退为普通点选。
      store.selectByCell(endPoint.x, endPoint.y);
    }
  }
  selecting = false;
  selectionMoved = false;
  hideSelectionBox();

  if (painting) {
    store.endAction();
  }
  painting = false;
  syncCanvasCursor();
};

const onWheel = (event: WheelEvent) => {
  if (!renderer) {
    return;
  }
  event.preventDefault();
  const ratio = event.deltaY < 0 ? 1.1 : 0.9;
  renderer.zoomAt(event.offsetX, event.offsetY, ratio);
};

const onPointerUp = (event: PointerEvent) => {
  setHoverCellByClient(event.clientX, event.clientY);
  lastPointer = { x: event.clientX, y: event.clientY };
  stopGesture(event);
};

onMounted(async () => {
  if (!hostRef.value) {
    return;
  }
  renderer = await GridRenderer.create(hostRef.value, store.project);
  renderer.setViewFlags(store.viewFlags);
  renderer.setProject(store.project);
  renderer.centerView();
  renderer.highlightSelection(store.selectedElement, store.project);
  syncCanvasCursor();

  // move/up 监听挂在 window 上，保证指针移出画布仍能正确收敛手势。
  hostRef.value.addEventListener("pointerdown", onPointerDown);
  hostRef.value.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
});

watch(
  () => store.project,
  (project) => {
    renderer?.setProject(project);
    renderer?.highlightSelection(store.selectedElement, project);
  },
);

watch(
  () => store.project.overlays.platformPanels,
  (panels) => {
    renderer?.redrawPanels(panels);
  },
  { deep: true },
);

watch(
  () => store.project.overlays.robotPaths,
  (paths) => {
    renderer?.redrawPaths(paths);
  },
  { deep: true },
);

watch(
  () => store.project.devices,
  (devices) => {
    renderer?.redrawDevices(devices);
  },
  { deep: true },
);

watch(
  () => store.viewFlags,
  (flags) => {
    renderer?.setViewFlags(flags);
  },
  { deep: true },
);

watch(
  () => store.selectedElement,
  (selection) => {
    renderer?.highlightSelection(selection, store.project);
  },
  { deep: true },
);

watch(
  () => store.centerSignal,
  () => {
    renderer?.centerView();
  },
);

watch(
  () => store.activeTool,
  () => {
    syncCanvasCursor();
  },
);

onBeforeUnmount(() => {
  if (hostRef.value) {
    hostRef.value.removeEventListener("pointerdown", onPointerDown);
    hostRef.value.removeEventListener("wheel", onWheel);
  }
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  renderer?.destroy();
});
</script>
