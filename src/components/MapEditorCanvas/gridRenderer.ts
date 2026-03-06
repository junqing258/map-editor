import { Application, Assets, Color, Container, Graphics, Sprite, Texture } from "pixi.js";

import batteryChargingSvgRaw from "@/assets/icons/battery-charging.svg?raw";
import packageMinusSvgRaw from "@/assets/icons/package-minus.svg?raw";
import packagePlusSvgRaw from "@/assets/icons/package-plus.svg?raw";
import type { MapDevice, MapProject, RobotPath, SelectedElement, ViewFlags } from "@/types/map";

interface ChunkEntry {
  sprite: Sprite;
  texture: Texture;
}

// 设备主色：用于边框、图标着色和状态一致性展示。
const deviceColorMap: Record<MapDevice["type"], string> = {
  supply: "#15803d",
  unload: "#d97706",
  charger: "#2563eb",
};

const deviceIconSvgMap: Partial<Record<MapDevice["type"], string>> = {
  supply: packagePlusSvgRaw,
  unload: packageMinusSvgRaw,
  charger: batteryChargingSvgRaw,
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
  // baseContainer 只放静态分块底图；overlayContainer 放网格、路径、选中态等动态层。
  private readonly baseContainer = new Container();
  private readonly overlayContainer = new Container();
  private readonly gridGraphics = new Graphics();
  private readonly pathGraphics = new Graphics();
  private readonly arrowGraphics = new Graphics();
  private readonly deviceGraphics = new Graphics();
  private readonly deviceIconContainer = new Container();
  private readonly selectionGraphics = new Graphics();
  private readonly deviceIconTextures: Partial<Record<MapDevice["type"], Texture>>;
  // 分块缓存，按 `chunkX:chunkY` 管理纹理生命周期，避免全图重绘。
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly cellPixel = 100;
  private project: MapProject;
  private flags: ViewFlags = {
    showGrid: true,
    showPath: true,
    showNavBlock: true,
  };
  private view = {
    zoom: 1,
    offsetX: 40,
    offsetY: 40,
  };

  private constructor(
    host: HTMLElement,
    app: Application,
    project: MapProject,
    deviceIconTextures: Partial<Record<MapDevice["type"], Texture>>,
  ) {
    this.host = host;
    this.app = app;
    this.project = project;
    this.deviceIconTextures = deviceIconTextures;
    this.overlayContainer.addChild(
      this.gridGraphics,
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
      background: new Color("#eef3f9"),
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
    this.redrawPaths(project.overlays.robotPaths);
    this.redrawDevices(project.devices);
  }

  setViewFlags(flags: ViewFlags) {
    // 可见性切换会影响静态块和动态图层，统一全量刷新。
    this.flags = { ...flags };
    this.rebuildAllChunks();
    this.redrawGrid();
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
      const alpha = 0.8
      // 路径线宽随单元尺寸比例变化，保证不同缩放/分辨率下可读性。
      this.pathGraphics.setStrokeStyle({
        width: Math.max(2, this.cellPixel * 0.09),
        color: path.color,
        alpha
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
            alpha
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
      const iconTexture = this.deviceIconTextures[device.type];
      const activeAlpha = device.config.enabled ? 0.95 : 0.35;

      if (iconTexture) {
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
          color: "#b91c1c",
        });
        this.deviceGraphics.moveTo(centerX - half + 1, centerY - half + 1);
        this.deviceGraphics.lineTo(centerX + half - 1, centerY + half - 1);
        this.deviceGraphics.moveTo(centerX + half - 1, centerY - half + 1);
        this.deviceGraphics.lineTo(centerX - half + 1, centerY + half - 1);
        this.deviceGraphics.stroke();
      }
    }
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
    this.selectionGraphics.rect(x * this.cellPixel, y * this.cellPixel, this.cellPixel, this.cellPixel);
    this.selectionGraphics.fill({ color: "#fdba74", alpha: 0.26 });
    this.selectionGraphics.setStrokeStyle({ width: 2, color: "#f97316" });
    this.selectionGraphics.stroke();
  }

  private highlightPathPoint(x: number, y: number) {
    this.selectionGraphics.circle(
      x * this.cellPixel + this.cellPixel / 2,
      y * this.cellPixel + this.cellPixel / 2,
      Math.max(5, this.cellPixel * 0.45),
    );
    this.selectionGraphics.setStrokeStyle({ width: 2, color: "#b91c1c" });
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
      color: "#cad4e2",
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

    const baseColor = "#f8fafc";
    const nodeColorMap: Record<number, string> = {
      1: "#dbe4f0",
      2: "#ede9fe",
      3: "#cffafe",
    };
    const nodeBorderMap: Record<number, string> = {
      1: "#94a3b8",
      2: "#8b5cf6",
      3: "#0891b2",
    };
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
          ctx.fillStyle = nodeColorMap[value] ?? nodeColorMap[1];
          ctx.fillRect(x * this.cellPixel + 1, y * this.cellPixel + 1, this.cellPixel - 2, this.cellPixel - 2);
          ctx.strokeStyle = nodeBorderMap[value] ?? nodeBorderMap[1];
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

  private static async loadDeviceIconTextures() {
    const textures: Partial<Record<MapDevice["type"], Texture>> = {};
    const iconEntries = Object.entries(deviceIconSvgMap) as Array<[MapDevice["type"], string | undefined]>;

    await Promise.all(
      iconEntries.map(async ([type, svgRaw]) => {
        if (!svgRaw) {
          return;
        }
        const color = deviceColorMap[type];
        const src = buildColoredSvgDataUrl(svgRaw, color);
        // 以更高分辨率加载 SVG，缩放时边缘更平滑。
        textures[type] = await Assets.load<Texture>({
          alias: `device-icon-${type}`,
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
