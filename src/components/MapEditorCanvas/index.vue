<template>
  <div ref="hostRef" class="map-canvas" @contextmenu.prevent>
    <div
      v-if="selectionBox.visible"
      class="map-select-rect"
      :style="selectionBoxStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useEditorStore } from "@/stores/editor";
import { GridRenderer } from "./gridRenderer";

const store = useEditorStore();
const hostRef = ref<HTMLElement | null>(null);

let renderer: GridRenderer | null = null;
let painting = false;
let panning = false;
let selecting = false;
let selectionMoved = false;
let selectStartCell = { x: 0, y: 0 };
let selectStartPointer = { x: 0, y: 0 };
let lastPointer = { x: 0, y: 0 };

const selectionBox = reactive({
  visible: false,
  left: 0,
  top: 0,
  width: 0,
  height: 0
});

const selectionBoxStyle = computed(() => ({
  left: `${selectionBox.left}px`,
  top: `${selectionBox.top}px`,
  width: `${selectionBox.width}px`,
  height: `${selectionBox.height}px`
}));

const isDeviceTool = () =>
  store.activeTool === "supply" ||
  store.activeTool === "unload" ||
  store.activeTool === "charger" ||
  store.activeTool === "queue" ||
  store.activeTool === "waiting";

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
  const { x, y } = renderer.screenToCell(clientX, clientY);

  if (store.activeTool === "platform") {
    const changed = store.applyPlatformAt(x, y);
    if (changed) {
      renderer.updateChunkByCell(x, y);
    }
    return;
  }

  if (store.activeTool === "path-draw") {
    const index = store.addPathPoint(x, y);
    if (index >= 0) {
      renderer.redrawPaths(store.project.overlays.robotPaths);
    }
    return;
  }

  if (store.activeTool === "path-erase") {
    const changed = store.erasePathPointAt(x, y);
    if (changed) {
      renderer.redrawPaths(store.project.overlays.robotPaths);
    }
    return;
  }

  if (isDeviceTool()) {
    const changed = store.placeDeviceByTool(store.activeTool, x, y);
    if (changed) {
      renderer.redrawDevices(store.project.devices);
    }
    return;
  }

  store.selectByCell(x, y);
};

const onPointerDown = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  lastPointer = { x: event.clientX, y: event.clientY };

  if (event.button === 1 || event.button === 2) {
    panning = true;
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
    return;
  }

  if (isDeviceTool()) {
    applyToolAt(event.clientX, event.clientY);
    return;
  }

  store.beginAction();
  painting = true;
  applyToolAt(event.clientX, event.clientY);
};

const onPointerMove = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  if (panning) {
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    renderer.panBy(dx, dy);
    lastPointer = { x: event.clientX, y: event.clientY };
    return;
  }

  if (selecting) {
    const deltaX = Math.abs(event.clientX - selectStartPointer.x);
    const deltaY = Math.abs(event.clientY - selectStartPointer.y);
    if (deltaX > 4 || deltaY > 4) {
      selectionMoved = true;
      selectionBox.visible = true;
      updateSelectionBox(event.clientX, event.clientY);
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
      store.selectDevicesInRect(
        selectStartCell.x,
        selectStartCell.y,
        endPoint.x,
        endPoint.y
      );
    } else {
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

  hostRef.value.addEventListener("pointerdown", onPointerDown);
  hostRef.value.addEventListener("pointermove", onPointerMove);
  hostRef.value.addEventListener("pointerup", onPointerUp);
  hostRef.value.addEventListener("pointerleave", onPointerUp);
  hostRef.value.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
});

watch(
  () => store.project,
  (project) => {
    renderer?.setProject(project);
    renderer?.highlightSelection(store.selectedElement, project);
  }
);

watch(
  () => store.project.overlays.robotPaths,
  (paths) => {
    renderer?.redrawPaths(paths);
  },
  { deep: true }
);

watch(
  () => store.project.devices,
  (devices) => {
    renderer?.redrawDevices(devices);
  },
  { deep: true }
);

watch(
  () => store.viewFlags,
  (flags) => {
    renderer?.setViewFlags(flags);
  },
  { deep: true }
);

watch(
  () => store.selectedElement,
  (selection) => {
    renderer?.highlightSelection(selection, store.project);
  },
  { deep: true }
);

watch(
  () => store.centerSignal,
  () => {
    renderer?.centerView();
  }
);

onBeforeUnmount(() => {
  if (hostRef.value) {
    hostRef.value.removeEventListener("pointerdown", onPointerDown);
    hostRef.value.removeEventListener("pointermove", onPointerMove);
    hostRef.value.removeEventListener("pointerup", onPointerUp);
    hostRef.value.removeEventListener("pointerleave", onPointerUp);
    hostRef.value.removeEventListener("wheel", onWheel);
  }
  window.removeEventListener("pointerup", onPointerUp);
  renderer?.destroy();
});
</script>
