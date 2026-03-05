# 工业网格地图编辑器（初始化）

基于以下技术栈的最小可运行工程：

- 渲染: PixiJS（WebGL，底图栅格按 chunk 生成 texture + 矢量路径叠加）
- 应用: Vue 3 + TypeScript + Vite
- 状态: Pinia
- 计算: Web Worker（栅格统计、机器人格式导出）
- 数据: JSON 工程格式 + 机器人导出格式（ROS-like / custom）

## 启动

```bash
npm install
npm run dev
```

构建检查：

```bash
npm run build
```

代码规范（ESLint + Prettier）：

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

## 交互说明

- 左键绘制障碍/擦除，或在“路径点”模式下添加路径点
- 右键/中键拖动画布
- 滚轮缩放

## 工程数据格式

核心结构在 `src/types/map.ts`：

- `grid`: `width`、`height`、`chunkSize`、`cellSizeMeter`
- `layers.base`: 栅格数组（`0`=可通行，`1`=障碍）
- `overlays.robotPaths`: 机器人路径点集合

## 导出

- `ROS-like`: 导出 occupancy-grid 风格 JSON
- `custom`: 导出 `robot-grid-v1` JSON

导出逻辑位于 `src/workers/map.worker.ts`，可继续扩展成真实 ROS map（如 `.pgm + .yaml`）或企业自定义协议。
