<template>
  <div ref="hostRef" class="map-canvas" @contextmenu.prevent />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useEditorStore } from "@/stores/editor";
import { GridRenderer } from "@/lib/pixi/gridRenderer";

const store = useEditorStore();
const hostRef = ref<HTMLElement | null>(null);

// Pixi 渲染器实例（挂载后创建，卸载时销毁）
let renderer: GridRenderer | null = null;
// 左键连续绘制状态
let painting = false;
// 中键/右键平移画布状态
let panning = false;
// 记录上一次指针位置，用于计算平移增量
let lastPointer = { x: 0, y: 0 };

// 将屏幕坐标转为网格坐标，并按当前工具执行编辑
const handlePaint = (clientX: number, clientY: number) => {
  if (!renderer) {
    return;
  }
  const { x, y } = renderer.screenToCell(clientX, clientY);
  if (store.activeTool === "path") {
    // 路径模式：点击新增/选中路径点并重绘矢量路径
    const index = store.addPathPoint(x, y);
    if (index >= 0) {
      store.selectPathPoint(store.activePathId, index);
    } else {
      store.selectNone();
    }
    renderer.redrawPaths(store.project.overlays.robotPaths);
    return;
  }
  // 栅格模式：写入单元并更新选中状态
  const changed = store.applyToolAt(x, y);
  store.selectCell(x, y);
  if (changed) {
    // 仅刷新受影响 chunk，避免整图重建
    renderer.updateChunkByCell(x, y);
  }
};

// 指针按下：左键绘制；中键/右键平移
const onPointerDown = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  if (event.button === 1 || event.button === 2) {
    panning = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.button !== 0) {
    return;
  }
  store.beginAction();
  painting = true;
  handlePaint(event.clientX, event.clientY);
  if (store.activeTool === "path") {
    // 路径点是离散点击，不进入拖拽连续绘制
    painting = false;
    store.endAction();
  }
};

// 指针移动：平移或连续绘制
const onPointerMove = (event: PointerEvent) => {
  if (!renderer) {
    return;
  }
  if (panning) {
    // 平移：根据当前与上次位置差更新视图偏移
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    renderer.panBy(dx, dy);
    lastPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  if (!painting || (event.buttons & 1) === 0 || store.activeTool === "path") {
    return;
  }
  handlePaint(event.clientX, event.clientY);
};

// 结束当前交互手势，并关闭 action（用于 undo/redo 分组）
const stopGesture = () => {
  if (painting) {
    store.endAction();
  }
  painting = false;
  panning = false;
};

// 滚轮围绕光标点缩放
const onWheel = (event: WheelEvent) => {
  if (!renderer) {
    return;
  }
  event.preventDefault();
  const ratio = event.deltaY < 0 ? 1.1 : 0.9;
  renderer.zoomAt(event.offsetX, event.offsetY, ratio);
};

onMounted(async () => {
  if (!hostRef.value) {
    return;
  }
  // 初始化 Pixi，并绑定画布交互事件
  renderer = await GridRenderer.create(hostRef.value, store.project);
  renderer.rebuildAllChunks();
  hostRef.value.addEventListener("pointerdown", onPointerDown);
  hostRef.value.addEventListener("pointermove", onPointerMove);
  hostRef.value.addEventListener("pointerup", stopGesture);
  hostRef.value.addEventListener("pointerleave", stopGesture);
  hostRef.value.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerup", stopGesture);
});

watch(
  () => store.project,
  (project) => {
    // 工程整体切换（新建/导入/撤销重做）时重建渲染内容
    renderer?.setProject(project);
  }
);

watch(
  () => store.project.overlays.robotPaths,
  (paths) => {
    // 路径数据变化时仅重绘叠加层
    renderer?.redrawPaths(paths);
  },
  { deep: true }
);

watch(
  () => store.selectedElement,
  (selection) => {
    if (!renderer) {
      return;
    }
    if (selection.kind === "cell") {
      // 高亮选中的栅格单元
      renderer.highlightCell(selection.x, selection.y);
      return;
    }
    if (selection.kind === "path-point") {
      // 高亮选中的路径点
      renderer.highlightPathPoint(selection.x, selection.y, selection.color);
      return;
    }
    // 无选中时清理高亮
    renderer.clearSelection();
  },
  { deep: true }
);

onBeforeUnmount(() => {
  // 解绑事件并释放 Pixi 资源，防止内存泄漏
  if (hostRef.value) {
    hostRef.value.removeEventListener("pointerdown", onPointerDown);
    hostRef.value.removeEventListener("pointermove", onPointerMove);
    hostRef.value.removeEventListener("pointerup", stopGesture);
    hostRef.value.removeEventListener("pointerleave", stopGesture);
    hostRef.value.removeEventListener("wheel", onWheel);
  }
  window.removeEventListener("pointerup", stopGesture);
  renderer?.destroy();
});
</script>
