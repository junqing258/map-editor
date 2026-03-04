import {
  Application,
  Color,
  Container,
  Graphics,
  Sprite,
  Texture
} from "pixi.js";
import type { MapProject, RobotPath } from "@/types/map";

interface ChunkEntry {
  sprite: Sprite;
  texture: Texture;
}

export class GridRenderer {
  private readonly app: Application;
  private readonly host: HTMLElement;
  private readonly baseContainer = new Container();
  private readonly overlayContainer = new Container();
  private readonly pathGraphics = new Graphics();
  // 独立选中高亮层，避免污染路径绘制图层
  private readonly selectionGraphics = new Graphics();
  // chunk 坐标到 sprite/texture 的索引表
  private readonly chunks = new Map<string, ChunkEntry>();
  // 单个栅格的像素尺寸（仅影响画布显示比例）
  private readonly cellPixel = 18;
  private view = {
    zoom: 1,
    offsetX: 40,
    offsetY: 40
  };
  private project: MapProject;

  private constructor(host: HTMLElement, app: Application, project: MapProject) {
    this.host = host;
    this.app = app;
    this.project = project;
    this.overlayContainer.addChild(this.pathGraphics, this.selectionGraphics);
    this.app.stage.addChild(this.baseContainer, this.overlayContainer);
    this.applyView();
  }

  static async create(host: HTMLElement, project: MapProject) {
    const app = new Application();
    await app.init({
      antialias: true,
      background: new Color("#f8fafc"),
      resizeTo: host
    });
    host.appendChild(app.canvas);
    return new GridRenderer(host, app, project);
  }

  setProject(project: MapProject) {
    this.project = project;
    this.rebuildAllChunks();
  }

  destroy() {
    for (const { texture } of this.chunks.values()) {
      texture.destroy(true);
    }
    this.chunks.clear();
    this.app.destroy(true, { children: true, texture: true });
  }

  rebuildAllChunks() {
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
    this.redrawPaths(this.project.overlays.robotPaths);
  }

  updateChunkByCell(x: number, y: number) {
    // 单格修改时只刷新所属 chunk，减少重绘开销
    const { chunkSize } = this.project.grid;
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    this.createOrReplaceChunk(cx, cy);
  }

  redrawPaths(paths: RobotPath[]) {
    this.pathGraphics.clear();
    this.pathGraphics.alpha = 0.9;

    for (const path of paths) {
      if (!path.points.length) {
        continue;
      }
      this.pathGraphics.setStrokeStyle({
        width: Math.max(2, this.cellPixel * 0.18),
        color: path.color
      });
      const start = path.points[0];
      this.pathGraphics.moveTo(
        start.x * this.cellPixel + this.cellPixel / 2,
        start.y * this.cellPixel + this.cellPixel / 2
      );
      for (let i = 1; i < path.points.length; i += 1) {
        const point = path.points[i];
        this.pathGraphics.lineTo(
          point.x * this.cellPixel + this.cellPixel / 2,
          point.y * this.cellPixel + this.cellPixel / 2
        );
      }
      this.pathGraphics.stroke();

      for (const point of path.points) {
        this.pathGraphics.circle(
          point.x * this.cellPixel + this.cellPixel / 2,
          point.y * this.cellPixel + this.cellPixel / 2,
          Math.max(2, this.cellPixel * 0.24)
        );
      }
      this.pathGraphics.fill({ color: path.color, alpha: 0.95 });
    }
  }

  clearSelection() {
    this.selectionGraphics.clear();
  }

  highlightCell(x: number, y: number) {
    // 栅格选中：填充 + 边框
    this.selectionGraphics.clear();
    this.selectionGraphics.rect(
      x * this.cellPixel,
      y * this.cellPixel,
      this.cellPixel,
      this.cellPixel
    );
    this.selectionGraphics.fill({ color: "#fbbf24", alpha: 0.28 });
    this.selectionGraphics.setStrokeStyle({ color: "#f59e0b", width: 2 });
    this.selectionGraphics.stroke();
  }

  highlightPathPoint(x: number, y: number, color: string) {
    // 路径点选中：外环 + 实心圆
    const centerX = x * this.cellPixel + this.cellPixel / 2;
    const centerY = y * this.cellPixel + this.cellPixel / 2;
    this.selectionGraphics.clear();
    this.selectionGraphics.circle(centerX, centerY, Math.max(6, this.cellPixel * 0.4));
    this.selectionGraphics.setStrokeStyle({
      color,
      width: Math.max(2, this.cellPixel * 0.15)
    });
    this.selectionGraphics.stroke();
    this.selectionGraphics.circle(centerX, centerY, Math.max(2, this.cellPixel * 0.16));
    this.selectionGraphics.fill({ color, alpha: 0.95 });
  }

  panBy(dx: number, dy: number) {
    this.view.offsetX += dx;
    this.view.offsetY += dy;
    this.applyView();
  }

  zoomAt(screenX: number, screenY: number, ratio: number) {
    const prev = this.view.zoom;
    const next = Math.max(0.3, Math.min(4.5, prev * ratio));
    if (Math.abs(next - prev) < 0.0001) {
      return;
    }

    const wx = (screenX - this.view.offsetX) / prev;
    const wy = (screenY - this.view.offsetY) / prev;
    // 以光标为锚点缩放，保持鼠标下内容尽量不跳动
    this.view.zoom = next;
    this.view.offsetX = screenX - wx * next;
    this.view.offsetY = screenY - wy * next;
    this.applyView();
  }

  screenToCell(clientX: number, clientY: number) {
    const rect = this.host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const worldX = (x - this.view.offsetX) / this.view.zoom;
    const worldY = (y - this.view.offsetY) / this.view.zoom;
    return {
      x: Math.floor(worldX / this.cellPixel),
      y: Math.floor(worldY / this.cellPixel)
    };
  }

  private applyView() {
    // 底图层和叠加层共用同一视图变换
    this.baseContainer.position.set(this.view.offsetX, this.view.offsetY);
    this.overlayContainer.position.set(this.view.offsetX, this.view.offsetY);
    this.baseContainer.scale.set(this.view.zoom);
    this.overlayContainer.scale.set(this.view.zoom);
  }

  private createOrReplaceChunk(chunkX: number, chunkY: number) {
    const key = `${chunkX}:${chunkY}`;
    const old = this.chunks.get(key);
    if (old) {
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
    this.baseContainer.addChild(sprite);
    this.chunks.set(key, { sprite, texture });
  }

  private buildChunkTexture(chunkX: number, chunkY: number) {
    // 使用离屏 canvas 生成 chunk 纹理，再交由 Pixi 贴图渲染
    const { width, height, chunkSize } = this.project.grid;
    const startX = chunkX * chunkSize;
    const startY = chunkY * chunkSize;
    const cellsX = Math.min(chunkSize, width - startX);
    const cellsY = Math.min(chunkSize, height - startY);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, cellsX * this.cellPixel);
    canvas.height = Math.max(1, cellsY * this.cellPixel);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Texture.WHITE;
    }

    const gridLine = "#d6deeb";
    const freeColor = "#f3f6fb";
    const obstacleColor = "#334155";
    const { base } = this.project.layers;
    const mapWidth = this.project.grid.width;

    for (let y = 0; y < cellsY; y += 1) {
      for (let x = 0; x < cellsX; x += 1) {
        const mapX = startX + x;
        const mapY = startY + y;
        const value = base[mapY * mapWidth + mapX];
        ctx.fillStyle = value === 1 ? obstacleColor : freeColor;
        ctx.fillRect(
          x * this.cellPixel,
          y * this.cellPixel,
          this.cellPixel,
          this.cellPixel
        );
      }
    }

    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x <= cellsX; x += 1) {
      const px = x * this.cellPixel + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cellsY * this.cellPixel);
      ctx.stroke();
    }
    for (let y = 0; y <= cellsY; y += 1) {
      const py = y * this.cellPixel + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(cellsX * this.cellPixel, py);
      ctx.stroke();
    }

    return Texture.from(canvas);
  }
}
