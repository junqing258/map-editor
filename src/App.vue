<template>
  <div class="workspace">
    <header class="menu-bar">
      <div class="menu-group">
        <button class="menu-btn" @click="openImportDialog">导入工程</button>
        <button class="menu-btn" @click="downloadProjectJson">导出工程</button>
      </div>
      <div class="menu-group">
        <button class="menu-btn" :disabled="busy" @click="exportRobot('ros')">
          导出 ROS-like
        </button>
        <button class="menu-btn" :disabled="busy" @click="exportRobot('custom')">
          导出 Custom
        </button>
      </div>
      <div class="menu-group">
        <button class="menu-btn" :disabled="!store.canUndo" @click="store.undo()">
          撤销
        </button>
        <button class="menu-btn" :disabled="!store.canRedo" @click="store.redo()">
          重做
        </button>
      </div>
      <input
        ref="fileRef"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="importProjectJson"
      />
    </header>

    <div class="app-shell">
      <aside class="toolbar">
        <h1>工具栏</h1>
        <p class="toolbar-subtitle">当前工具：{{ activeToolLabel }}</p>
        <div class="tool-stack">
          <button
            class="tool-btn tool-btn-icon"
            :class="{ active: store.activeTool === 'obstacle' }"
            @click="store.activeTool = 'obstacle'"
          >
            <span class="tool-icon-wrap">
              <Square class="tool-icon" :size="18" />
            </span>
            <span class="tool-meta">
              <span class="tool-name">障碍绘制</span>
              <span class="tool-desc">写入障碍栅格</span>
            </span>
          </button>
          <button
            class="tool-btn tool-btn-icon"
            :class="{ active: store.activeTool === 'erase' }"
            @click="store.activeTool = 'erase'"
          >
            <span class="tool-icon-wrap">
              <Eraser class="tool-icon" :size="18" />
            </span>
            <span class="tool-meta">
              <span class="tool-name">擦除</span>
              <span class="tool-desc">恢复可通行状态</span>
            </span>
          </button>
          <button
            class="tool-btn tool-btn-icon"
            :class="{ active: store.activeTool === 'path' }"
            @click="store.activeTool = 'path'"
          >
            <span class="tool-icon-wrap">
              <Route class="tool-icon" :size="18" />
            </span>
            <span class="tool-meta">
              <span class="tool-name">路径点</span>
              <span class="tool-desc">点击添加导航点</span>
            </span>
          </button>
        </div>
        <!-- <p class="hint">
          使用“路径点”工具后，在画布上左键点击依次落点。右键/中键拖动画布，滚轮缩放。
        </p> -->
        <button class="tool-btn tool-btn-icon danger" @click="store.clearPath()">
          <span class="tool-icon-wrap">
            <Trash2 class="tool-icon" :size="18" />
          </span>
          <span class="tool-meta">
            <span class="tool-name">清空路径</span>
            <span class="tool-desc">移除当前路径全部点</span>
          </span>
        </button>
      </aside>

      <main class="canvas-wrap">
        <MapEditorCanvas />
      </main>

      <aside class="prop-panel">
        <h2>属性面板</h2>

        <section class="section">
          <div class="label">选中元素</div>
          <template v-if="store.selectedElement.kind === 'cell'">
            <p class="prop-item">类型: 栅格单元</p>
            <p class="prop-item">坐标: ({{ store.selectedElement.x }}, {{ store.selectedElement.y }})</p>
            <p class="prop-item">
              状态: {{ store.selectedElement.value === 1 ? "障碍" : "可通行" }}
            </p>
          </template>
          <template v-else-if="store.selectedElement.kind === 'path-point'">
            <p class="prop-item">类型: 路径点</p>
            <p class="prop-item">路径: {{ store.selectedElement.pathName }}</p>
            <p class="prop-item">序号: {{ store.selectedElement.index + 1 }}</p>
            <p class="prop-item">坐标: ({{ store.selectedElement.x }}, {{ store.selectedElement.y }})</p>
          </template>
          <p v-else class="prop-empty">未选中元素</p>
        </section>

        <section class="section">
          <div class="label">地图属性</div>
          <label class="field">
            地图名称
            <input
              v-model="store.project.meta.name"
              class="input"
              @change="store.touch()"
            />
          </label>
          <div class="grid-inputs">
            <label>
              宽
              <input v-model.number="draft.width" class="input" type="number" min="8" />
            </label>
            <label>
              高
              <input v-model.number="draft.height" class="input" type="number" min="8" />
            </label>
            <label>
              分辨率(m/cell)
              <input
                v-model.number="draft.cellSizeMeter"
                class="input"
                type="number"
                min="0.01"
                step="0.01"
              />
            </label>
            <label>
              分块(cell)
              <input v-model.number="draft.chunkSize" class="input" type="number" min="4" />
            </label>
          </div>
          <button class="menu-btn full" @click="createMap">应用并重建</button>
        </section>

        <section class="section">
          <div class="label">栅格统计（Worker）</div>
          <p class="prop-item">
            尺寸: {{ stats?.width ?? "-" }} x {{ stats?.height ?? "-" }}
          </p>
          <p class="prop-item">障碍格: {{ stats?.obstacleCount ?? "-" }}</p>
          <p class="prop-item">空闲格: {{ stats?.freeCount ?? "-" }}</p>
          <p class="prop-item">
            占用率:
            {{
              stats ? `${(stats.occupancyRate * 100).toFixed(2)}%` : "-"
            }}
          </p>
          <p v-if="errorText" class="error">{{ errorText }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Eraser, Route, Square, Trash2 } from "lucide-vue-next";
import MapEditorCanvas from "@/components/MapEditorCanvas.vue";
import { useEditorStore } from "@/stores/editor";
import { useMapWorker } from "@/composables/useMapWorker";
import { downloadTextFile } from "@/utils/download";
import { parseProjectJson } from "@/utils/projectIO";
import { createEmptyProject, type ExportFormat, type RasterStats } from "@/types/map";

const store = useEditorStore();
const worker = useMapWorker();
const fileRef = ref<HTMLInputElement | null>(null);
const stats = ref<RasterStats | null>(null);
const busy = ref(false);
const errorText = ref("");
const draft = reactive({
  width: store.project.grid.width,
  height: store.project.grid.height,
  cellSizeMeter: store.project.grid.cellSizeMeter,
  chunkSize: store.project.grid.chunkSize
});
const activeToolLabel = computed(() => {
  if (store.activeTool === "obstacle") {
    return "障碍绘制";
  }
  if (store.activeTool === "erase") {
    return "擦除";
  }
  return "路径点";
});

let statsTimer: number | null = null;

const onKeyDown = (event: KeyboardEvent) => {
  const withMod = event.ctrlKey || event.metaKey;
  if (!withMod) {
    return;
  }
  if (event.key.toLowerCase() === "z" && event.shiftKey) {
    event.preventDefault();
    store.redo();
    return;
  }
  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    store.undo();
    return;
  }
  if (event.key.toLowerCase() === "y") {
    event.preventDefault();
    store.redo();
  }
};

const refreshStats = async () => {
  try {
    const result = await worker.calcStats(store.project);
    stats.value = result;
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "统计失败";
  }
};

const createMap = () => {
  const width = Math.max(8, Math.floor(draft.width));
  const height = Math.max(8, Math.floor(draft.height));
  const cellSizeMeter = Math.max(0.01, Number(draft.cellSizeMeter) || 0.1);
  const chunkSize = Math.max(4, Math.floor(draft.chunkSize));
  const project = createEmptyProject(width, height);
  project.grid.cellSizeMeter = cellSizeMeter;
  project.grid.chunkSize = chunkSize;
  store.resetProject(project);
};

const downloadProjectJson = () => {
  downloadTextFile(
    `${store.project.meta.name}.project.json`,
    JSON.stringify(store.project, null, 2),
    "application/json"
  );
};

const exportRobot = async (format: ExportFormat) => {
  busy.value = true;
  try {
    const result = await worker.exportForRobot(store.project, format);
    downloadTextFile(result.filename, result.content, result.mimeType);
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "导出失败";
  } finally {
    busy.value = false;
  }
};

const openImportDialog = () => {
  fileRef.value?.click();
};

const importProjectJson = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const project = parseProjectJson(text);
    store.resetProject(project);
    draft.width = store.project.grid.width;
    draft.height = store.project.grid.height;
    draft.cellSizeMeter = store.project.grid.cellSizeMeter;
    draft.chunkSize = store.project.grid.chunkSize;
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "导入失败";
  }
};

watch(
  () => store.revision,
  () => {
    if (statsTimer) {
      window.clearTimeout(statsTimer);
    }
    statsTimer = window.setTimeout(() => {
      void refreshStats();
    }, 90);
  }
);

onMounted(() => {
  void refreshStats();
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  if (statsTimer) {
    window.clearTimeout(statsTimer);
  }
  window.removeEventListener("keydown", onKeyDown);
  worker.terminate();
});
</script>
