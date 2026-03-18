<template>
  <div class="grid h-full w-full grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 p-2.5">
    <header
      class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-3 py-2 shadow-sm backdrop-blur"
    >
      <div class="flex items-center gap-2 border-r border-dashed border-slate-200 pr-3 last:border-r-0">
        <span class="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">地图</span>
        <Button size="sm" variant="outline" @click="showNewMap = true">新建</Button>
        <Button size="sm" variant="outline" @click="openLibrary">地图库</Button>
        <Button size="sm" variant="outline" @click="triggerImport">导入</Button>
        <Button size="sm" variant="outline" @click="saveToLibrary(false)">保存地图</Button>
        <Button size="sm" variant="outline" @click="saveToLibrary(true)">存为草稿</Button>
        <Button size="sm" variant="default" :disabled="busy" @click="exportMap">导出地图</Button>
      </div>

      <div class="flex items-center gap-2 border-r border-dashed border-slate-200 pr-3 last:border-r-0">
        <span class="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">编辑</span>
        <Button size="sm" variant="outline" @click="store.resetMapData()">重置地图</Button>
        <Button size="sm" variant="outline" @click="exportDevicesCsv">导出外设</Button>
      </div>

      <div class="flex items-center gap-2 pr-3">
        <span class="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">视图</span>
        <Button
          size="sm"
          :variant="store.viewFlags.showGrid ? 'default' : 'outline'"
          @click="store.setViewFlag('showGrid')"
        >
          显示网格
        </Button>
        <Button
          size="sm"
          :variant="store.viewFlags.showPath ? 'default' : 'outline'"
          @click="store.setViewFlag('showPath')"
        >
          路径
        </Button>
        <Button
          size="sm"
          :variant="store.viewFlags.showNavBlock ? 'default' : 'outline'"
          @click="store.setViewFlag('showNavBlock')"
        >
          导航块
        </Button>
        <Button
          size="sm"
          :variant="store.viewFlags.showPanelLayout ? 'default' : 'outline'"
          @click="store.setViewFlag('showPanelLayout')"
        >
          实际面板
        </Button>
      </div>
    </header>

    <section
      class="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 rounded-xl border border-slate-300 bg-slate-50/90 px-3 py-2 max-[1180px]:grid-cols-1"
    >
      <div class="flex flex-wrap items-center gap-2.5">
        <template v-if="store.activeTool === 'select'">
          <p class="m-0 text-[13px] text-slate-600">选框工具：点击选中单个对象，拖拽可框选设备、钢平台和路径点。</p>
        </template>

        <template v-else-if="store.activeTool === 'platform'">
          <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
            模式
            <select v-model="store.toolOptions.platformMode" class="input mini">
              <option value="drag">拖动绘制</option>
              <option value="batch">极速绘制</option>
            </select>
          </label>
          <div v-if="store.toolOptions.platformMode === 'batch'" class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
              行
              <input v-model.number="store.toolOptions.batchRows" class="input mini" type="number" min="1" />
            </label>
            <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
              列
              <input v-model.number="store.toolOptions.batchCols" class="input mini" type="number" min="1" />
            </label>
            <Button size="sm" variant="default" @click="applyBatchPlatform">极速生成</Button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" :disabled="planningPanels" @click="planPlatformPanels">
              {{ planningPanels ? "规划中..." : "规划面板" }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="planningPanels || store.project.overlays.platformPanels.length === 0"
              @click="store.clearPlatformPanels()"
            >
              清除面板
            </Button>
          </div>
          <p class="m-0 text-[13px] text-slate-600">按 2x4 优先、剩余用 1x2 自动铺排；平台轮廓改动后需重新规划。</p>
          <p class="m-0 text-[13px] text-slate-600">
            当前布局: 2x4 {{ panelLayoutStats.largeCount }} 块，1x2 {{ panelLayoutStats.smallCount }} 块，覆盖
            {{ panelLayoutStats.coveredCellCount }}/{{ stats?.nodeCount ?? 0 }} 格
          </p>
        </template>

        <template v-else-if="store.activeTool === 'path-draw'">
          <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
            方向
            <select v-model="store.toolOptions.pathDirection" class="input mini">
              <option value="oneway">单向</option>
              <option value="bidirectional">全向</option>
            </select>
          </label>
          <p class="m-0 text-[13px] text-slate-600">左键连续描绘路径；松开后在其他位置重新起笔可新建另一条路径。</p>
        </template>

        <template v-else-if="store.activeTool === 'path-erase'">
          <p class="m-0 text-[13px] text-slate-600">路径擦除：左键点击路径点执行擦除。</p>
        </template>

        <template v-else-if="store.activeTool === 'supply'">
          <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
            供货模式
            <select v-model="store.toolOptions.supplyMode" class="input mini">
              <option value="auto">自动供包</option>
              <option value="manual">人工</option>
              <option value="elevator">提升机</option>
            </select>
          </label>
        </template>

        <template v-else-if="store.activeTool === 'unload'">
          <label class="inline-flex items-center gap-2 text-[13px] text-slate-600">
            卸货类型
            <select v-model="store.toolOptions.unloadMode" class="input mini">
              <option value="normal">普通</option>
              <option value="multi-sort">多维分拣</option>
            </select>
          </label>
        </template>

        <template v-else-if="store.activeTool === 'queue' || store.activeTool === 'waiting'">
          <p class="m-0 text-[13px] text-slate-600">在钢平台上标记区域状态（排队区/等待区）。</p>
        </template>

        <template v-else>
          <p class="m-0 text-[13px] text-slate-600">在画布网格节点上点击布置设备。</p>
        </template>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" @click="store.requestCenterView()">视图居中</Button>
        <Button size="sm" variant="outline" :disabled="!store.canUndo" @click="store.undo()">撤销</Button>
        <Button size="sm" variant="outline" :disabled="!store.canRedo" @click="store.redo()">重做</Button>
        <Button size="sm" variant="default" @click="checkPath">检查路径</Button>
      </div>
    </section>

    <div
      class="grid min-h-0 grid-cols-[170px_minmax(0,1fr)_340px] gap-2.5 max-[1180px]:grid-cols-1 max-[1180px]:grid-rows-[auto_minmax(420px,1fr)_auto]"
    >
      <aside
        class="flex h-hull flex-col gap-2.5 overflow-auto rounded-xl border border-slate-300 bg-white p-3 max-[1180px]:max-h-[220px]"
      >
        <h1 class="m-0 text-[17px] font-semibold tracking-[0.2px] text-slate-800">快捷工具</h1>
        <div class="grid grid-cols-1 gap-2 max-[1180px]:grid-cols-3">
          <Button
            size="sm"
            :variant="store.activeTool === 'select' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('select')"
          >
            <MousePointer2 :size="16" />
            <span>选框工具</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'path-draw' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('path-draw')"
          >
            <Route :size="16" />
            <span>路径绘制</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'path-erase' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('path-erase')"
          >
            <Eraser :size="16" />
            <span>路径擦除</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'platform' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('platform')"
          >
            <Square :size="16" />
            <span>钢平台</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'supply' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('supply')"
          >
            <PackagePlus :size="16" class="tool-device-icon supply" />
            <span>供货点</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'unload' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('unload')"
          >
            <PackageMinus :size="16" class="tool-device-icon unload" />
            <span>卸货点</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'charger' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('charger')"
          >
            <BatteryCharging :size="16" class="tool-device-icon charger" />
            <span>充电桩</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'queue' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('queue')"
          >
            <span class="tool-dot queue" />
            <span>排队区</span>
          </Button>
          <Button
            size="sm"
            :variant="store.activeTool === 'waiting' ? 'default' : 'secondary'"
            class="tool-action-btn w-full justify-start gap-2 border-slate-300/80"
            @click="store.setTool('waiting')"
          >
            <span class="tool-dot waiting" />
            <span>等待区</span>
          </Button>
        </div>
      </aside>

      <main
        class="min-h-0 overflow-hidden rounded-xl border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 shadow-md"
      >
        <MapEditorCanvas :store="store" />
      </main>

      <aside class="flex flex-col gap-2.5 overflow-auto rounded-xl border border-slate-300 bg-white p-3">
        <h2 class="m-0 text-[17px] font-semibold tracking-[0.2px] text-slate-800">地图概况</h2>
        <section class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="my-1 text-[13px] text-slate-700">名称: {{ store.project.meta.name }}</p>
          <p class="my-1 text-[13px] text-slate-700">
            场景: {{ store.project.meta.scene === "production" ? "生产" : "仿真" }}
          </p>
          <p class="my-1 text-[13px] text-slate-700">
            网格: {{ stats?.width ?? "-" }} x {{ stats?.height ?? "-" }} ({{ store.project.grid.cellSizeMeter }}m)
          </p>
          <p class="my-1 text-[13px] text-slate-700">钢平台节点: {{ stats?.nodeCount ?? "-" }}</p>
          <p class="my-1 text-[13px] text-slate-700">空白节点: {{ stats?.freeCount ?? "-" }}</p>
          <p class="my-1 text-[13px] text-slate-700">
            场地面积: {{ stats ? `${stats.siteAreaSqm.toFixed(2)} m²` : "-" }}
          </p>
          <p class="my-1 text-[13px] text-slate-700">
            路径: {{ stats?.pathCount ?? "-" }} / 点位 {{ stats?.pathPointCount ?? "-" }}
          </p>
          <p class="my-1 text-[13px] text-slate-700">
            设备统计: 供{{ stats?.deviceCounts.supply ?? 0 }} 卸{{ stats?.deviceCounts.unload ?? 0 }} 充{{
              stats?.deviceCounts.charger ?? 0
            }}
          </p>
          <p class="my-1 text-[13px] text-slate-700">
            平台状态: 排队区 {{ stats?.queueCellCount ?? 0 }} / 等待区
            {{ stats?.waitingCellCount ?? 0 }}
          </p>
          <p class="my-1 text-[13px] text-slate-700">
            实际面板: 2x4 {{ panelLayoutStats.largeCount }} / 1x2 {{ panelLayoutStats.smallCount }} / 未覆盖
            {{ panelLayoutStats.uncoveredCellCount }}
          </p>
        </section>

        <h2 class="m-0 text-[17px] font-semibold tracking-[0.2px] text-slate-800">对象属性</h2>
        <section class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <template v-if="store.selectedElement.kind === 'none'">
            <p class="mt-1.5 text-[13px] text-slate-500">未选中对象</p>
          </template>

          <template v-else-if="store.selectedElement.kind === 'cell'">
            <p class="my-1 text-[13px] text-slate-700">类型: 网格节点</p>
            <p class="my-1 text-[13px] text-slate-700">
              坐标: ({{ store.selectedElement.x }}, {{ store.selectedElement.y }})
            </p>
            <p class="my-1 text-[13px] text-slate-700">状态: {{ selectedCellStatus }}</p>
          </template>

          <template v-else-if="store.selectedElement.kind === 'path-point'">
            <p class="my-1 text-[13px] text-slate-700">类型: 路径点</p>
            <p class="my-1 text-[13px] text-slate-700">路径: {{ store.selectedElement.pathName }}</p>
            <p class="my-1 text-[13px] text-slate-700">序号: {{ store.selectedElement.index + 1 }}</p>
            <p class="my-1 text-[13px] text-slate-700">
              坐标: ({{ store.selectedElement.x }}, {{ store.selectedElement.y }})
            </p>
            <p class="my-1 text-[13px] text-slate-700">
              方向: {{ store.selectedElement.direction === "oneway" ? "单向" : "全向" }}
            </p>
          </template>

          <template v-else-if="store.selectedElement.kind === 'device' && store.singleSelectedDevice">
            <label class="mt-2 block text-[13px] text-slate-600 first:mt-0">
              名称
              <input v-model="singleForm.name" class="input" />
            </label>
            <label class="mt-2 block text-[13px] text-slate-600 first:mt-0">
              硬件ID
              <input v-model="singleForm.hardwareId" class="input" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label>
                速度
                <input v-model.number="singleForm.speedLimit" class="input" type="number" step="0.1" />
              </label>
              <label>
                最大等待
                <input v-model.number="singleForm.maxQueue" class="input" type="number" min="0" />
              </label>
              <label>
                朝向角度
                <input v-model.number="singleForm.directionDeg" class="input" type="number" />
              </label>
              <label>
                可用状态
                <select v-model="singleForm.enabledText" class="input">
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </label>
            </div>
            <label v-if="store.singleSelectedDevice.type === 'supply'" class="mt-2 block text-[13px] text-slate-600">
              供货模式
              <select v-model="singleForm.supplyMode" class="input">
                <option value="auto">自动</option>
                <option value="manual">人工</option>
                <option value="elevator">提升机</option>
              </select>
            </label>
            <label v-if="store.singleSelectedDevice.type === 'unload'" class="mt-2 block text-[13px] text-slate-600">
              卸货类型
              <select v-model="singleForm.unloadMode" class="input">
                <option value="normal">普通</option>
                <option value="multi-sort">多维分拣</option>
              </select>
            </label>
            <Button class="w-full mt-2" size="sm" @click="applySingleProps">应用属性</Button>
          </template>

          <template v-else-if="store.selectedElement.kind === 'device-batch'">
            <p class="my-1 text-[13px] text-slate-700">已选择 {{ store.selectedElement.deviceIds.length }} 个设备</p>
            <label class="mt-2 block text-[13px] text-slate-600 first:mt-0">
              名称前缀
              <input v-model="batchForm.prefix" class="input" placeholder="如 batch-dev" />
            </label>
            <label class="mt-2 block text-[13px] text-slate-600">
              启用状态
              <select v-model="batchForm.enabledMode" class="input">
                <option value="keep">保持不变</option>
                <option value="true">全部启用</option>
                <option value="false">全部禁用</option>
              </select>
            </label>
            <label class="mt-2 block text-[13px] text-slate-600">
              速度覆盖
              <input v-model="batchForm.speedLimitText" class="input" placeholder="留空为不修改" />
            </label>
            <Button class="w-full" size="sm" @click="applyBatchProps">批量应用</Button>
          </template>

          <template v-else-if="store.selectedElement.kind === 'mixed-batch'">
            <p class="my-1 text-[13px] text-slate-700">批量选择:</p>
            <p class="my-1 text-[13px] text-slate-700">设备 {{ store.selectedElement.deviceIds.length }} 个</p>
            <p class="my-1 text-[13px] text-slate-700">钢平台 {{ store.selectedElement.cells.length }} 个</p>
            <p class="my-1 text-[13px] text-slate-700">路径点 {{ store.selectedElement.pathPoints.length }} 个</p>
          </template>

          <Button
            v-if="canDeleteSelectedElement"
            class="mt-2 w-full"
            size="sm"
            variant="destructive"
            @click="store.deleteSelectedElement()"
          >
            删除所选元素
          </Button>
        </section>

        <h2 class="m-0 text-[17px] font-semibold tracking-[0.2px] text-slate-800">地图元数据</h2>
        <section class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label class="mt-2 block text-[13px] text-slate-600 first:mt-0">
            地图名称
            <input v-model="store.project.meta.name" class="input" @change="store.touch()" />
          </label>
          <label class="mt-2 block text-[13px] text-slate-600">
            标签（逗号分隔）
            <input v-model="tagsText" class="input" @change="applyTags" />
          </label>
          <p class="mt-1.5 text-[13px] text-slate-600">当前检查：{{ checkStatus }}</p>
          <p v-if="errorText" class="mt-2 text-[13px] text-red-700" role="alert">{{ errorText }}</p>
        </section>
      </aside>
    </div>

    <input ref="fileRef" type="file" accept="application/json,.json" class="hidden" @change="importProjectJson" />

    <div
      v-if="showNewMap"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-3"
      @click.self="showNewMap = false"
    >
      <div class="w-[min(560px,92vw)] rounded-xl border border-slate-300 bg-white p-4 shadow-2xl">
        <h3 class="mb-2.5 text-lg font-semibold text-slate-900">新建地图</h3>
        <div class="grid grid-cols-2 gap-2">
          <label>
            地图名称
            <input v-model="newMapForm.name" class="input" />
          </label>
          <label>
            场景
            <select v-model="newMapForm.scene" class="input">
              <option value="production">生产</option>
              <option value="simulation">仿真</option>
            </select>
          </label>
          <label>
            宽
            <input v-model.number="newMapForm.width" class="input" type="number" min="8" />
          </label>
          <label>
            高
            <input v-model.number="newMapForm.height" class="input" type="number" min="8" />
          </label>
          <label class="col-span-2">
            标签
            <input v-model="newMapForm.tagsText" class="input" placeholder="A区,仿真,测试" />
          </label>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" @click="showNewMap = false">取消</Button>
          <Button size="sm" @click="createMap">创建</Button>
        </div>
      </div>
    </div>

    <div
      v-if="showLibrary"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-3"
      @click.self="showLibrary = false"
    >
      <div class="w-[min(920px,94vw)] rounded-xl border border-slate-300 bg-white p-4 shadow-2xl">
        <h3 class="mb-2.5 text-lg font-semibold text-slate-900">地图库</h3>
        <div class="mb-2 grid grid-cols-[1fr_140px_auto] gap-2 max-[1180px]:grid-cols-1">
          <input v-model="librarySearch" class="input" placeholder="搜索地图名称" />
          <select v-model="libraryFilter" class="input">
            <option value="all">全部</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </select>
          <Button size="sm" variant="destructive" @click="deleteLibrarySelected">删除选中</Button>
        </div>
        <div class="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50">
          <div
            v-for="item in filteredLibrary"
            :key="item.id"
            class="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-slate-200 px-3 py-2 last:border-b-0"
          >
            <label class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                class="size-4 rounded border-slate-300 text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400"
                :checked="librarySelected.includes(item.id)"
                @change="toggleLibrarySelect(item.id)"
              />
              <span class="truncate font-semibold text-slate-800">{{ item.name }}</span>
              <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-900">
                {{ item.draft ? "草稿" : "发布" }}
              </span>
              <span class="text-xs text-slate-500">{{ item.updatedAt }}</span>
            </label>
            <div class="flex gap-1.5">
              <Button size="sm" variant="outline" @click="openLibraryItem(item.id)">打开</Button>
              <Button size="sm" variant="outline" @click="exportLibraryItem(item.id)">导出</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BatteryCharging, Eraser, MousePointer2, PackageMinus, PackagePlus, Route, Square } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from "vue";

import { createEditorStore } from "@/components/MapEditorCanvas/editorStore";
import MapEditorCanvas from "@/components/MapEditorCanvas/index.vue";
import { Button } from "@/components/ui/button";
import { useMapWorker } from "@/composables/useMapWorker";
import type { MapOverviewStats, MapProject, PathCheckResult, SceneType } from "@/types/map";
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH } from "@/types/map";
import { downloadTextFile } from "@/utils/download";
import { parseProjectJson } from "@/utils/projectIO";
import { safeStructuredClone } from "@/utils/safeClone";

interface LibraryItem {
  id: string;
  name: string;
  draft: boolean;
  scene: SceneType;
  tags: string[];
  updatedAt: string;
  project: MapProject;
}

const LIB_KEY = "hyperleap-map-library-v1";

const store = createEditorStore();
const worker = useMapWorker();

const fileRef = ref<HTMLInputElement | null>(null);
const stats = ref<MapOverviewStats | null>(null);
const busy = ref(false);
const planningPanels = ref(false);
const errorText = ref("");

const showNewMap = ref(false);
const showLibrary = ref(false);
const tagsText = ref("");
const checkResult = ref<PathCheckResult | null>(null);

const newMapForm = reactive({
  name: "factory-map",
  width: DEFAULT_MAP_WIDTH,
  height: DEFAULT_MAP_HEIGHT,
  scene: "production" as SceneType,
  tagsText: "",
});

const singleForm = reactive({
  name: "",
  hardwareId: "",
  speedLimit: 1.2,
  maxQueue: 4,
  directionDeg: 0,
  enabledText: "true",
  supplyMode: "auto" as "auto" | "manual" | "elevator",
  unloadMode: "normal" as "normal" | "multi-sort",
});

const batchForm = reactive({
  prefix: "",
  enabledMode: "keep",
  speedLimitText: "",
});

const libraryItems = ref<LibraryItem[]>([]);
const librarySearch = ref("");
const libraryFilter = ref<"all" | "published" | "draft">("all");
const librarySelected = ref<string[]>([]);

const checkStatus = computed(() => {
  if (!checkResult.value) {
    return "未执行";
  }
  if (checkResult.value.ok) {
    return "通过";
  }
  return checkResult.value.issues[0] ?? "失败";
});

const selectedCellStatus = computed(() => {
  if (store.selectedElement.kind !== "cell") {
    return "-";
  }
  const value = store.getCell(store.selectedElement.x, store.selectedElement.y);
  if (value === 1) {
    return "钢平台";
  }
  if (value === 2) {
    return "排队区";
  }
  if (value === 3) {
    return "等待区";
  }
  return "空白";
});

const canDeleteSelectedElement = computed(() => {
  const selection = store.selectedElement;
  if (selection.kind === "none") {
    return false;
  }
  if (selection.kind === "cell") {
    return selection.active;
  }
  if (selection.kind === "path-point" || selection.kind === "device") {
    return true;
  }
  if (selection.kind === "device-batch") {
    return selection.deviceIds.length > 0;
  }
  return selection.deviceIds.length + selection.cells.length + selection.pathPoints.length > 0;
});

const panelLayoutStats = computed(() => {
  const panels = store.project.overlays.platformPanels;
  const largeCount = panels.filter((panel) => panel.spec === "2x4").length;
  const smallCount = panels.length - largeCount;
  const coveredCellCount = panels.reduce((acc, panel) => acc + panel.width * panel.height, 0);
  const platformCellCount =
    stats.value?.nodeCount ?? store.project.layers.base.reduce<number>((acc, cell) => (cell > 0 ? acc + 1 : acc), 0);
  return {
    largeCount,
    smallCount,
    coveredCellCount,
    uncoveredCellCount: Math.max(0, platformCellCount - coveredCellCount),
  };
});

const filteredLibrary = computed(() =>
  libraryItems.value.filter((item) => {
    if (libraryFilter.value === "published" && item.draft) {
      return false;
    }
    if (libraryFilter.value === "draft" && !item.draft) {
      return false;
    }
    if (!librarySearch.value.trim()) {
      return true;
    }
    return item.name.toLowerCase().includes(librarySearch.value.trim().toLowerCase());
  }),
);

let statsTimer: number | null = null;

const refreshStats = async () => {
  try {
    stats.value = await worker.calcStats(store.project);
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "统计失败";
    console.error(error);
  }
};

const applyTags = () => {
  store.project.meta.tags = tagsText.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  store.touch();
};

const checkPath = () => {
  checkResult.value = store.runPathCheck();
};

const createMap = () => {
  store.createNewMap({
    name: newMapForm.name,
    width: newMapForm.width,
    height: newMapForm.height,
    scene: newMapForm.scene,
    tags: newMapForm.tagsText.split(",").map((item) => item.trim()),
  });
  tagsText.value = store.project.meta.tags.join(",");
  checkResult.value = null;
  showNewMap.value = false;
};

const applyBatchPlatform = () => {
  store.fillPlatformBatch(store.toolOptions.batchRows, store.toolOptions.batchCols);
};

const planPlatformPanels = async () => {
  planningPanels.value = true;
  try {
    const panels = await worker.planPlatformPanels(store.project);
    store.applyPlatformPanels(panels);
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "规划面板失败";
  } finally {
    planningPanels.value = false;
  }
};

const exportMap = async () => {
  busy.value = true;
  try {
    const payload = await worker.exportForRobot(store.project, "custom");
    downloadTextFile(payload.filename, payload.content, payload.mimeType);
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "导出失败";
  } finally {
    busy.value = false;
  }
};

const triggerImport = () => {
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
    tagsText.value = store.project.meta.tags.join(",");
    checkResult.value = null;
    errorText.value = "";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "导入失败";
  }
};

const exportDevicesCsv = () => {
  const rows = ["name,type,x,y,enabled,hardwareId,speedLimit,maxQueue,directionDeg,supplyMode,unloadMode"];
  for (const device of store.project.devices) {
    rows.push(
      [
        device.name,
        device.type,
        device.x,
        device.y,
        device.config.enabled ? "1" : "0",
        device.config.hardwareId,
        device.config.speedLimit,
        device.config.maxQueue,
        device.config.directionDeg,
        device.config.supplyMode ?? "",
        device.config.unloadMode ?? "",
      ].join(","),
    );
  }
  downloadTextFile(`${store.project.meta.name}-devices.csv`, rows.join("\n"), "text/csv");
};

const loadLibrary = () => {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) {
      libraryItems.value = [];
      return;
    }
    const parsed = JSON.parse(raw) as LibraryItem[];
    libraryItems.value = Array.isArray(parsed) ? parsed : [];
  } catch {
    libraryItems.value = [];
  }
};

const saveLibrary = () => {
  localStorage.setItem(LIB_KEY, JSON.stringify(libraryItems.value));
};

const saveToLibrary = (draft: boolean) => {
  const id = `${store.project.meta.name}-${draft ? "draft" : "published"}`;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const entry: LibraryItem = {
    id,
    name: store.project.meta.name,
    draft,
    scene: store.project.meta.scene,
    tags: [...store.project.meta.tags],
    updatedAt: now,
    project: safeStructuredClone(toRaw(store.project)),
  };
  libraryItems.value = [entry, ...libraryItems.value.filter((item) => item.id !== id)];
  saveLibrary();
};

const openLibrary = () => {
  loadLibrary();
  librarySelected.value = [];
  showLibrary.value = true;
};

const openLibraryItem = (id: string) => {
  const item = libraryItems.value.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  store.resetProject(parseProjectJson(JSON.stringify(item.project)));
  tagsText.value = store.project.meta.tags.join(",");
  checkResult.value = null;
  showLibrary.value = false;
};

const exportLibraryItem = (id: string) => {
  const item = libraryItems.value.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  downloadTextFile(`${item.name}.project.json`, JSON.stringify(item.project, null, 2));
};

const toggleLibrarySelect = (id: string) => {
  if (librarySelected.value.includes(id)) {
    librarySelected.value = librarySelected.value.filter((item) => item !== id);
  } else {
    librarySelected.value = [...librarySelected.value, id];
  }
};

const deleteLibrarySelected = () => {
  if (librarySelected.value.length === 0) {
    return;
  }
  libraryItems.value = libraryItems.value.filter((item) => !librarySelected.value.includes(item.id));
  librarySelected.value = [];
  saveLibrary();
};

const applySingleProps = () => {
  store.updateSingleDevice({
    name: singleForm.name,
    hardwareId: singleForm.hardwareId,
    speedLimit: Number(singleForm.speedLimit),
    maxQueue: Number(singleForm.maxQueue),
    directionDeg: Number(singleForm.directionDeg),
    enabled: singleForm.enabledText === "true",
    supplyMode: singleForm.supplyMode,
    unloadMode: singleForm.unloadMode,
  });
};

const applyBatchProps = () => {
  const speedText = batchForm.speedLimitText.trim();
  const speedValue = speedText.length > 0 ? Number(speedText) : undefined;
  store.applyBatchDevicePatch({
    prefix: batchForm.prefix.trim() || undefined,
    enabled: batchForm.enabledMode === "keep" ? undefined : batchForm.enabledMode === "true",
    speedLimit: Number.isFinite(speedValue) ? speedValue : undefined,
  });
};

const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const editingTag = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
  const key = event.key.toLowerCase();
  const withMod = event.ctrlKey || event.metaKey;

  if (!withMod && !editingTag) {
    if (key === "backspace" || key === "delete") {
      event.preventDefault();
      store.deleteSelectedElement();
      return;
    }
    if (key === "v") {
      store.setTool("select");
    } else if (key === "p") {
      store.setTool("path-draw");
    } else if (key === "e") {
      store.setTool("path-erase");
    }
  }

  if (!withMod) {
    return;
  }
  if (key === "n") {
    event.preventDefault();
    showNewMap.value = true;
    return;
  }
  if (key === "o") {
    event.preventDefault();
    openLibrary();
    return;
  }
  if (key === "s") {
    event.preventDefault();
    saveToLibrary(false);
    return;
  }
  if (key === "z" && event.shiftKey) {
    event.preventDefault();
    store.redo();
    return;
  }
  if (key === "z") {
    event.preventDefault();
    store.undo();
    return;
  }
  if (key === "y") {
    event.preventDefault();
    store.redo();
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
    }, 80);
  },
);

watch(
  () => store.singleSelectedDevice,
  (device) => {
    if (!device) {
      return;
    }
    singleForm.name = device.name;
    singleForm.hardwareId = device.config.hardwareId;
    singleForm.speedLimit = device.config.speedLimit;
    singleForm.maxQueue = device.config.maxQueue;
    singleForm.directionDeg = device.config.directionDeg;
    singleForm.enabledText = device.config.enabled ? "true" : "false";
    singleForm.supplyMode = device.config.supplyMode ?? "auto";
    singleForm.unloadMode = device.config.unloadMode ?? "normal";
  },
  { immediate: true },
);

onMounted(() => {
  loadLibrary();
  tagsText.value = store.project.meta.tags.join(",");
  void refreshStats();
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  if (statsTimer) {
    window.clearTimeout(statsTimer);
  }
  worker.terminate();
  window.removeEventListener("keydown", onKeyDown);
});
</script>
