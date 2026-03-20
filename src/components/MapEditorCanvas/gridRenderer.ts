import { Application, Assets, Color, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

import batteryChargingSvgRaw from "@/assets/icons/battery-charging.svg?raw";
import packageMinusSvgRaw from "@/assets/icons/package-minus.svg?raw";
import packageMinusMultiSortSvgRaw from "@/assets/icons/package-minus-multi-sort.svg?raw";
import packagePlusSvgRaw from "@/assets/icons/package-plus.svg?raw";
import {
  CELL_FILL_COLOR_MAP,
  CELL_STROKE_COLOR_MAP,
  DEVICE_COLOR_MAP,
  mapPalette,
  PANEL_COLOR_MAP,
} from "@/lib/mapPalette";
import type { MapDevice, MapProject, RobotPath, SelectedElement, ViewFlags } from "@/types/map";

interface ChunkEntry {
  // chunk 以 sprite + texture 成对缓存，便于替换时同时释放显示对象和 GPU 资源。
  sprite: Sprite;
  texture: Texture;
}

// 设备主色：用于边框、图标着色和状态一致性展示。
const deviceColorMap: Record<MapDevice["type"], string> = DEVICE_COLOR_MAP;

type DeviceIconKey = MapDevice["type"] | "unload-multi-sort";

// 卸货口在 multi-sort 模式下使用独立图标，其余设备类型与业务 type 一一对应。
const deviceIconSvgMap: Partial<Record<DeviceIconKey, string>> = {
  supply: packagePlusSvgRaw,
  unload: packageMinusSvgRaw,
  "unload-multi-sort": packageMinusMultiSortSvgRaw,
  charger: batteryChargingSvgRaw,
};

const getDeviceIconKey = (device: MapDevice): DeviceIconKey => {
  // 图标选择只关心“设备类别 + 特殊卸货模式”，避免渲染层直接理解更多业务细节。
  if (device.type === "unload" && device.config.unloadMode === "multi-sort") {
    return "unload-multi-sort";
  }
  return device.type;
};

const getDeviceIconColor = (key: DeviceIconKey) => {
  if (key === "unload-multi-sort") {
    return deviceColorMap.unload;
  }
  return deviceColorMap[key];
};

// 将原始 SVG 按设备类型着色并放大，避免缩放后图标过糊。
const buildColoredSvgDataUrl = (svgRaw: string, color: string) => {
  const svg = svgRaw
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/width="24"/g, 'width="96"')
    .replace(/height="24"/g, 'height="96"');
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export class GridRenderer {
  private readonly app: Application;
  private readonly host: HTMLElement;
  // baseContainer 只承载按 chunk 缓存的静态底图 sprite，编辑时支持局部替换。
  private readonly baseContainer = new Container();
  // overlayContainer 汇总所有动态图层，统一跟随视图缩放和平移。
  private readonly overlayContainer = new Container();
  private readonly gridGraphics = new Graphics();
  private readonly panelGraphics = new Graphics();
  private readonly pathGraphics = new Graphics();
  private readonly arrowGraphics = new Graphics();
  private readonly deviceGraphics = new Graphics();
  private readonly deviceIconContainer = new Container();
  private readonly selectionGraphics = new Graphics();
  private readonly deviceIconTextures: Partial<Record<DeviceIconKey, Texture>>;
  // 分块缓存，按 `chunkX:chunkY` 管理纹理生命周期，避免全图重绘。
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly cellPixel = 100;
  private project: MapProject;
  private flags: ViewFlags = {
    showGrid: true,
    showPath: true,
    showNavBlock: true,
    showPanelLayout: true,
  };
  private view = {
    zoom: 1,
    offsetX: 40,
    offsetY: 40,
  };
  private viewportSize = {
    width: 0,
    height: 0,
  };

  private constructor(
    host: HTMLElement,
    app: Application,
    project: MapProject,
    deviceIconTextures: Partial<Record<DeviceIconKey, Texture>>,
  ) {
    this.host = host;
    this.app = app;
    this.project = project;
    this.deviceIconTextures = deviceIconTextures;
    this.overlayContainer.addChild(
      this.gridGraphics,
      this.panelGraphics,
      this.pathGraphics,
      this.arrowGraphics,
      this.deviceGraphics,
      this.deviceIconContainer,
      this.selectionGraphics,
    );
    this.app.stage.addChild(this.baseContainer, this.overlayContainer);
    this.applyView();
  }

  static async create(host: HTMLElement, project: MapProject) {
    // Pixi Application 采用容器尺寸自适应，画布生命周期由 Renderer 托管。
    const app = new Application();
    await app.init({
      antialias: true,
      background: new Color(mapPalette.canvas.background),
      resizeTo: host,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    const deviceIconTextures = await GridRenderer.loadDeviceIconTextures();
    host.appendChild(app.canvas);
    return new GridRenderer(host, app, project, deviceIconTextures);
  }

  setProject(project: MapProject) {
    // 数据对象整体替换后，重建分块并刷新所有动态图层。
    this.project = project;
    this.rebuildAllChunks();
    this.redrawGrid();
    this.redrawPanels(project.overlays.platformPanels);
    this.redrawPaths(project.overlays.robotPaths);
    this.redrawDevices(project.devices);
  }

  setViewFlags(flags: ViewFlags) {
    // 可见性切换会影响静态块和动态图层，统一全量刷新。
    this.flags = { ...flags };
    this.rebuildAllChunks();
    this.redrawGrid();
    this.redrawPanels(this.project.overlays.platformPanels);
    this.redrawPaths(this.project.overlays.robotPaths);
    this.redrawDevices(this.project.devices);
  }

  destroy() {
    // 先释放本地分块纹理，再销毁 Pixi 树，避免残留 GPU 资源。
    for (const { texture } of this.chunks.values()) {
      texture.destroy(true);
    }
    this.chunks.clear();
    this.app.destroy(true, { children: true, texture: true });
  }

  centerView() {
    const rect = this.host.getBoundingClientRect();
    const mapWidth = this.project.grid.width * this.cellPixel;
    const mapHeight = this.project.grid.height * this.cellPixel;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }
    const zoom = Math.max(0.35, Math.min(2.8, Math.min((rect.width - 80) / mapWidth, (rect.height - 80) / mapHeight)));
    // 预留边距后做适配缩放，避免贴边显示。
    this.view.zoom = zoom;
    this.view.offsetX = (rect.width - mapWidth * zoom) / 2;
    this.view.offsetY = (rect.height - mapHeight * zoom) / 2;
    this.viewportSize.width = rect.width;
    this.viewportSize.height = rect.height;
    this.applyView();
  }

  refreshLayout() {
    const rect = this.host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    if (this.viewportSize.width <= 0 || this.viewportSize.height <= 0) {
      this.viewportSize.width = rect.width;
      this.viewportSize.height = rect.height;
      this.applyView();
      return;
    }

    // 容器尺寸变化时保持当前视口中心点不跳动，只重算偏移。
    const centerWorldX = (this.viewportSize.width / 2 - this.view.offsetX) / this.view.zoom;
    const centerWorldY = (this.viewportSize.height / 2 - this.view.offsetY) / this.view.zoom;
    this.view.offsetX = rect.width / 2 - centerWorldX * this.view.zoom;
    this.view.offsetY = rect.height / 2 - centerWorldY * this.view.zoom;
    this.viewportSize.width = rect.width;
    this.viewportSize.height = rect.height;
    this.applyView();
  }

  rebuildAllChunks() {
    // 网格底图按 chunk 重建：单块纹理更小，编辑时可局部更新。
    for (const { sprite, texture } of this.chunks.values()) {
      this.baseContainer.removeChild(sprite);
      sprite.destroy();
      texture.destroy(true);
    }
    this.chunks.clear();

    const { width, height, chunkSize } = this.project.grid;
    const chunkCols = Math.ceil(width / chunkSize);
    const chunkRows = Math.ceil(height / chunkSize);

    for (let cy = 0; cy < chunkRows; cy += 1) {
      for (let cx = 0; cx < chunkCols; cx += 1) {
        this.createOrReplaceChunk(cx, cy);
      }
    }
  }

  updateChunkByCell(x: number, y: number) {
    const { chunkSize } = this.project.grid;
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    // 单点编辑时仅刷新所在分块，降低绘制成本。
    this.createOrReplaceChunk(cx, cy);
  }

  redrawPaths(paths: RobotPath[]) {
    this.pathGraphics.clear();
    this.arrowGraphics.clear();
    if (!this.flags.showPath) {
      return;
    }

    for (const path of paths) {
      if (path.points.length < 1) {
        continue;
      }
      const alpha = 0.8;
      // 路径线宽随单元尺寸比例变化，保证不同缩放/分辨率下可读性。
      this.pathGraphics.setStrokeStyle({
        width: Math.max(2, this.cellPixel * 0.09),
        color: path.color,
        alpha,
      });

      const start = path.points[0];
      this.pathGraphics.moveTo(
        start.x * this.cellPixel + this.cellPixel / 2,
        start.y * this.cellPixel + this.cellPixel / 2,
      );
      for (let i = 1; i < path.points.length; i += 1) {
        const point = path.points[i];
        this.pathGraphics.lineTo(
          point.x * this.cellPixel + this.cellPixel / 2,
          point.y * this.cellPixel + this.cellPixel / 2,
        );
      }
      this.pathGraphics.stroke();

      for (const point of path.points) {
        this.pathGraphics.circle(
          point.x * this.cellPixel + this.cellPixel / 2,
          point.y * this.cellPixel + this.cellPixel / 2,
          Math.max(2, this.cellPixel * 0.12),
        );
      }
      this.pathGraphics.fill({ color: path.color, alpha });

      if (path.direction === "oneway") {
        // 单向路径在每个线段中点绘制箭头，避免与端点圆形重叠。
        for (let i = 1; i < path.points.length; i += 1) {
          const from = path.points[i - 1];
          const to = path.points[i];
          this.drawArrow(
            from.x * this.cellPixel + this.cellPixel / 2,
            from.y * this.cellPixel + this.cellPixel / 2,
            to.x * this.cellPixel + this.cellPixel / 2,
            to.y * this.cellPixel + this.cellPixel / 2,
            path.color,
            alpha,
          );
        }
      }
    }
  }

  private drawArrow(fromX: number, fromY: number, toX: number, toY: number, color: string, alpha: number) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 6) {
      return;
    }
    const angle = Math.atan2(dy, dx);
    const head = Math.max(4, this.cellPixel * 0.24);
    // 箭头绘制在中点，避免覆盖路径端点圆。
    const centerX = (fromX + toX) / 2;
    const centerY = (fromY + toY) / 2;

    const leftX = centerX - Math.cos(angle - Math.PI / 6) * head;
    const leftY = centerY - Math.sin(angle - Math.PI / 6) * head;
    const rightX = centerX - Math.cos(angle + Math.PI / 6) * head;
    const rightY = centerY - Math.sin(angle + Math.PI / 6) * head;

    this.arrowGraphics.poly([centerX, centerY, leftX, leftY, rightX, rightY]);
    this.arrowGraphics.fill({ color, alpha });
  }

  redrawDevices(devices: MapDevice[]) {
    this.deviceGraphics.clear();
    // 图标是 Sprite，需要在重绘前主动销毁旧实例。
    const prevDeviceIcons = this.deviceIconContainer.removeChildren();
    prevDeviceIcons.forEach((icon) => icon.destroy());
    for (const device of devices) {
      const color = deviceColorMap[device.type];
      const centerX = device.x * this.cellPixel + this.cellPixel / 2;
      const centerY = device.y * this.cellPixel + this.cellPixel / 2;
      const size = this.cellPixel * 0.72;
      const half = size / 2;
      const iconTexture = this.deviceIconTextures[getDeviceIconKey(device)];
      const activeAlpha = device.config.enabled ? 0.95 : 0.35;

      if (iconTexture) {
        // 底板由 Graphics 批量绘制，图标本体继续用 Sprite 复用纹理，兼顾性能与清晰度。
        this.deviceGraphics.roundRect(centerX - half, centerY - half, size, size, 10);
        this.deviceGraphics.fill({
          color: "#ffffff",
          alpha: device.config.enabled ? 0.9 : 0.45,
        });
        this.deviceGraphics.setStrokeStyle({
          width: 2,
          color,
          alpha: activeAlpha,
        });
        this.deviceGraphics.stroke();

        const icon = new Sprite(iconTexture);
        icon.anchor.set(0.5);
        icon.position.set(centerX, centerY);
        const iconSize = size * 0.62;
        icon.width = iconSize;
        icon.height = iconSize;
        icon.alpha = activeAlpha;
        this.deviceIconContainer.addChild(icon);
      }

      if (!device.config.enabled) {
        // 禁用态叠加红色叉号，保持底色与图标仍可识别设备类型。
        this.deviceGraphics.setStrokeStyle({
          width: 2,
          color: mapPalette.danger.hover,
        });
        this.deviceGraphics.moveTo(centerX - half + 1, centerY - half + 1);
        this.deviceGraphics.lineTo(centerX + half - 1, centerY + half - 1);
        this.deviceGraphics.moveTo(centerX + half - 1, centerY - half + 1);
        this.deviceGraphics.lineTo(centerX - half + 1, centerY + half - 1);
        this.deviceGraphics.stroke();
      }
    }
  }
  // 绘制规格面板
  redrawPanels(panels: MapProject["overlays"]["platformPanels"]) {
    this.panelGraphics.clear();
    if (!this.flags.showPanelLayout || panels.length === 0) {
      return;
    }

    const strokeWidth = Math.max(2, this.cellPixel * 0.04);
    panels.forEach((panel) => {
      const x = panel.x * this.cellPixel + 4;
      const y = panel.y * this.cellPixel + 4;
      const width = panel.width * this.cellPixel - 8;
      const height = panel.height * this.cellPixel - 8;
      const isLarge = panel.spec === "2x4";
      const palette = PANEL_COLOR_MAP[panel.spec];
      const inset = isLarge ? 16 : 12;

      // 先画外框，再补一条中轴线提示朝向/规格，避免平台块视觉过于实心。
      this.panelGraphics.roundRect(x, y, width, height, 12);
      this.panelGraphics.fill({ color: palette.fill, alpha: isLarge ? 0.52 : 0.38 });
      this.panelGraphics.setStrokeStyle({
        width: strokeWidth,
        color: palette.stroke,
        alpha: 0.9,
      });
      this.panelGraphics.stroke();

      this.panelGraphics.setStrokeStyle({
        width: Math.max(1, strokeWidth * 0.65),
        color: palette.stroke,
        alpha: 0.45,
      });
      if (panel.rotated) {
        const centerX = x + width / 2;
        this.panelGraphics.moveTo(centerX, y + inset);
        this.panelGraphics.lineTo(centerX, y + height - inset);
      } else {
        const centerY = y + height / 2;
        this.panelGraphics.moveTo(x + inset, centerY);
        this.panelGraphics.lineTo(x + width - inset, centerY);
      }
      this.panelGraphics.stroke();
    });
  }

  highlightSelection(selection: SelectedElement, project: MapProject) {
    this.selectionGraphics.clear();
    if (selection.kind === "none") {
      return;
    }
    if (selection.kind === "cell") {
      this.highlightCell(selection.x, selection.y);
      return;
    }
    if (selection.kind === "path-point") {
      this.highlightPathPoint(selection.x, selection.y);
      return;
    }
    if (selection.kind === "device") {
      const device = project.devices.find((item) => item.id === selection.deviceId);
      if (device) {
        this.highlightDevice(device);
      }
      return;
    }
    if (selection.kind === "device-batch") {
      const devices = project.devices.filter((item) => selection.deviceIds.includes(item.id));
      devices.forEach((device) => {
        this.highlightDevice(device);
      });
      return;
    }

    // mixed-batch：设备、平台格、路径点同时高亮。
    const devices = project.devices.filter((item) => selection.deviceIds.includes(item.id));
    devices.forEach((device) => {
      this.highlightDevice(device);
    });
    selection.cells.forEach((cell) => {
      this.highlightCell(cell.x, cell.y);
    });
    selection.pathPoints.forEach((point) => {
      this.highlightPathPoint(point.x, point.y);
    });
  }

  panBy(dx: number, dy: number) {
    this.view.offsetX += dx;
    this.view.offsetY += dy;
    // 视图平移只影响容器变换，不触发底图重建。
    this.applyView();
  }

  zoomAt(screenX: number, screenY: number, ratio: number) {
    const prev = this.view.zoom;
    const next = Math.max(0.3, Math.min(4.5, prev * ratio));
    if (Math.abs(next - prev) < 0.0001) {
      return;
    }
    // 以鼠标所在世界坐标为锚点缩放，保持视觉焦点不跳动。
    const wx = (screenX - this.view.offsetX) / prev;
    const wy = (screenY - this.view.offsetY) / prev;
    this.view.zoom = next;
    this.view.offsetX = screenX - wx * next;
    this.view.offsetY = screenY - wy * next;
    this.applyView();
  }

  async exportMapImage() {
    const mapWidth = Math.max(1, this.project.grid.width * this.cellPixel);
    const mapHeight = Math.max(1, this.project.grid.height * this.cellPixel);
    const previousView = { ...this.view };
    const previousSelectionVisible = this.selectionGraphics.visible;

    try {
      // 导出整张地图时固定到世界坐标系原点，避免受当前缩放/平移影响。
      this.selectionGraphics.visible = false;
      this.view.zoom = 1;
      this.view.offsetX = 0;
      this.view.offsetY = 0;
      this.applyView();
      this.app.renderer.render({ container: this.app.stage });

      const texture = this.app.renderer.textureGenerator.generateTexture({
        target: this.app.stage,
        frame: new Rectangle(0, 0, mapWidth, mapHeight),
        resolution: 1,
        clearColor: mapPalette.canvas.background,
        antialias: true,
      });
      const canvas = this.app.renderer.texture.generateCanvas(texture) as HTMLCanvasElement;

      try {
        return await this.canvasToBlob(canvas);
      } finally {
        texture.destroy(true);
      }
    } finally {
      this.selectionGraphics.visible = previousSelectionVisible;
      this.view = previousView;
      this.applyView();
      this.app.renderer.render({ container: this.app.stage });
    }
  }

  screenToCell(clientX: number, clientY: number) {
    const rect = this.host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // 屏幕坐标 -> 世界坐标 -> 网格坐标。
    const worldX = (x - this.view.offsetX) / this.view.zoom;
    const worldY = (y - this.view.offsetY) / this.view.zoom;
    return {
      x: Math.floor(worldX / this.cellPixel),
      y: Math.floor(worldY / this.cellPixel),
    };
  }

  private highlightCell(x: number, y: number) {
    // 选中格子保留原底图可见性，因此只叠加半透明填充和描边。
    this.selectionGraphics.rect(x * this.cellPixel, y * this.cellPixel, this.cellPixel, this.cellPixel);
    this.selectionGraphics.fill({ color: mapPalette.brand.solid, alpha: 0.2 });
    this.selectionGraphics.setStrokeStyle({ width: 2, color: mapPalette.brand.solid });
    this.selectionGraphics.stroke();
  }

  private highlightPathPoint(x: number, y: number) {
    // 路径点用圆环高亮，和格子选中态区分开，便于混合批量选择时快速识别。
    this.selectionGraphics.circle(
      x * this.cellPixel + this.cellPixel / 2,
      y * this.cellPixel + this.cellPixel / 2,
      Math.max(5, this.cellPixel * 0.45),
    );
    this.selectionGraphics.setStrokeStyle({ width: 2, color: mapPalette.danger.hover });
    this.selectionGraphics.stroke();
  }

  private highlightDevice(device: MapDevice) {
    this.highlightCell(device.x, device.y);
  }

  private applyView() {
    // 底图层与覆盖层共用同一套平移/缩放，确保像素对齐。
    this.baseContainer.position.set(this.view.offsetX, this.view.offsetY);
    this.overlayContainer.position.set(this.view.offsetX, this.view.offsetY);
    this.baseContainer.scale.set(this.view.zoom);
    this.overlayContainer.scale.set(this.view.zoom);
    this.redrawGrid();
  }

  private redrawGrid() {
    this.gridGraphics.clear();
    if (!this.flags.showGrid) {
      return;
    }

    const { width, height } = this.project.grid;
    const mapWidth = width * this.cellPixel;
    const mapHeight = height * this.cellPixel;
    // 缩放时保持网格线视觉宽度近似 1px。
    const lineWidth = 1 / Math.max(this.view.zoom, 0.0001);

    this.gridGraphics.setStrokeStyle({
      width: lineWidth,
      color: mapPalette.canvas.grid,
    });

    for (let x = 0; x <= width; x += 1) {
      const px = x * this.cellPixel;
      this.gridGraphics.moveTo(px, 0);
      this.gridGraphics.lineTo(px, mapHeight);
    }

    for (let y = 0; y <= height; y += 1) {
      const py = y * this.cellPixel;
      this.gridGraphics.moveTo(0, py);
      this.gridGraphics.lineTo(mapWidth, py);
    }

    this.gridGraphics.stroke();
  }

  private createOrReplaceChunk(chunkX: number, chunkY: number) {
    const key = `${chunkX}:${chunkY}`;
    const old = this.chunks.get(key);
    if (old) {
      // 先释放旧纹理，避免频繁编辑时显存累积。
      this.baseContainer.removeChild(old.sprite);
      old.sprite.destroy();
      old.texture.destroy(true);
      this.chunks.delete(key);
    }

    const texture = this.buildChunkTexture(chunkX, chunkY);
    const sprite = new Sprite(texture);
    const chunkPixel = this.project.grid.chunkSize * this.cellPixel;
    // chunk sprite 始终定位到世界坐标原点系，缩放/平移统一交给容器处理。
    sprite.x = chunkX * chunkPixel;
    sprite.y = chunkY * chunkPixel;
    sprite.roundPixels = true;
    this.baseContainer.addChild(sprite);
    this.chunks.set(key, { sprite, texture });
  }

  private buildChunkTexture(chunkX: number, chunkY: number) {
    const { width, height, chunkSize } = this.project.grid;
    const startX = chunkX * chunkSize;
    const startY = chunkY * chunkSize;
    // 边缘 chunk 可能不足一个完整块，需要按实际剩余格子数裁切尺寸。
    const cellsX = Math.min(chunkSize, width - startX);
    const cellsY = Math.min(chunkSize, height - startY);
    // 每个 chunk 离屏绘制成纹理，再作为 Sprite 放入 baseContainer。

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, cellsX * this.cellPixel);
    canvas.height = Math.max(1, cellsY * this.cellPixel);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Texture.WHITE;
    }

    const baseColor = mapPalette.canvas.background;
    const mapWidth = this.project.grid.width;
    const { base } = this.project.layers;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.flags.showNavBlock) {
      // 只在当前分块内绘制有效节点，最终上传为一张静态纹理。
      for (let y = 0; y < cellsY; y += 1) {
        for (let x = 0; x < cellsX; x += 1) {
          const mapX = startX + x;
          const mapY = startY + y;
          const value = base[mapY * mapWidth + mapX];
          if (value === 0) {
            continue;
          }
          // 单元格留出 1px 内边距，让网格线和节点填充层次更清楚。
          ctx.fillStyle = CELL_FILL_COLOR_MAP[value as 1 | 2 | 3] ?? CELL_FILL_COLOR_MAP[1];
          ctx.fillRect(x * this.cellPixel + 1, y * this.cellPixel + 1, this.cellPixel - 2, this.cellPixel - 2);
          ctx.strokeStyle = CELL_STROKE_COLOR_MAP[value as 1 | 2 | 3] ?? CELL_STROKE_COLOR_MAP[1];
          ctx.lineWidth = 1;
          ctx.strokeRect(x * this.cellPixel + 1.5, y * this.cellPixel + 1.5, this.cellPixel - 3, this.cellPixel - 3);
        }
      }
    }

    const texture = Texture.from(canvas);
    // 平台块纹理不需要线性采样，避免缩放后颜色发糊。
    texture.source.scaleMode = "nearest";
    return texture;
  }

  private canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error("导出图片失败"));
        }, "image/png");
        return;
      }

      reject(new Error("当前浏览器不支持导出图片"));
    });
  }

  private static async loadDeviceIconTextures() {
    const textures: Partial<Record<DeviceIconKey, Texture>> = {};
    const iconEntries = Object.entries(deviceIconSvgMap) as Array<[DeviceIconKey, string | undefined]>;

    await Promise.all(
      iconEntries.map(async ([key, svgRaw]) => {
        if (!svgRaw) {
          return;
        }
        const color = getDeviceIconColor(key);
        const src = buildColoredSvgDataUrl(svgRaw, color);
        // 以更高分辨率加载 SVG，缩放时边缘更平滑。
        textures[key] = await Assets.load<Texture>({
          alias: `device-icon-${key}`,
          src,
          data: {
            resolution: 4,
            parseAsGraphicsContext: false,
          },
        });
      }),
    );

    return textures;
  }
}
