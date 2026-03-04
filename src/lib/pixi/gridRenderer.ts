import { Application, Color, Container, Graphics, Sprite, Texture } from "pixi.js";
import type {
  MapDevice,
  MapProject,
  RobotPath,
  SelectedElement,
  ViewFlags
} from "@/types/map";

interface ChunkEntry {
  sprite: Sprite;
  texture: Texture;
}

const deviceColorMap: Record<MapDevice["type"], string> = {
  supply: "#16a34a",
  unload: "#d97706",
  charger: "#2563eb",
  queue: "#a21caf",
  waiting: "#0891b2"
};

export class GridRenderer {
  private readonly app: Application;
  private readonly host: HTMLElement;
  private readonly baseContainer = new Container();
  private readonly overlayContainer = new Container();
  private readonly pathGraphics = new Graphics();
  private readonly arrowGraphics = new Graphics();
  private readonly deviceGraphics = new Graphics();
  private readonly selectionGraphics = new Graphics();
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly cellPixel = 100;
  private project: MapProject;
  private flags: ViewFlags = {
    showGrid: true,
    showPath: true,
    showNavBlock: true
  };
  private view = {
    zoom: 1,
    offsetX: 40,
    offsetY: 40
  };

  private constructor(host: HTMLElement, app: Application, project: MapProject) {
    this.host = host;
    this.app = app;
    this.project = project;
    this.overlayContainer.addChild(
      this.pathGraphics,
      this.arrowGraphics,
      this.deviceGraphics,
      this.selectionGraphics
    );
    this.app.stage.addChild(this.baseContainer, this.overlayContainer);
    this.applyView();
  }

  static async create(host: HTMLElement, project: MapProject) {
    const app = new Application();
    await app.init({
      antialias: true,
      background: new Color("#f4f8ff"),
      resizeTo: host
    });
    host.appendChild(app.canvas);
    return new GridRenderer(host, app, project);
  }

  setProject(project: MapProject) {
    this.project = project;
    this.rebuildAllChunks();
    this.redrawPaths(project.overlays.robotPaths);
    this.redrawDevices(project.devices);
  }

  setViewFlags(flags: ViewFlags) {
    this.flags = { ...flags };
    this.rebuildAllChunks();
    this.redrawPaths(this.project.overlays.robotPaths);
    this.redrawDevices(this.project.devices);
  }

  destroy() {
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
    const zoom = Math.max(
      0.35,
      Math.min(2.8, Math.min((rect.width - 80) / mapWidth, (rect.height - 80) / mapHeight))
    );
    this.view.zoom = zoom;
    this.view.offsetX = (rect.width - mapWidth * zoom) / 2;
    this.view.offsetY = (rect.height - mapHeight * zoom) / 2;
    this.applyView();
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
  }

  updateChunkByCell(x: number, y: number) {
    const { chunkSize } = this.project.grid;
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
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
      this.pathGraphics.setStrokeStyle({
        width: Math.max(2, this.cellPixel * 0.15),
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
          Math.max(2, this.cellPixel * 0.2)
        );
      }
      this.pathGraphics.fill({ color: path.color, alpha: 0.95 });

      if (path.direction === "oneway") {
        for (let i = 1; i < path.points.length; i += 1) {
          const from = path.points[i - 1];
          const to = path.points[i];
          this.drawArrow(
            from.x * this.cellPixel + this.cellPixel / 2,
            from.y * this.cellPixel + this.cellPixel / 2,
            to.x * this.cellPixel + this.cellPixel / 2,
            to.y * this.cellPixel + this.cellPixel / 2,
            path.color
          );
        }
      }
    }
  }

  redrawDevices(devices: MapDevice[]) {
    this.deviceGraphics.clear();
    for (const device of devices) {
      const color = deviceColorMap[device.type];
      const centerX = device.x * this.cellPixel + this.cellPixel / 2;
      const centerY = device.y * this.cellPixel + this.cellPixel / 2;
      const size = this.cellPixel * 0.72;
      const half = size / 2;

      this.deviceGraphics.setStrokeStyle({
        width: 2,
        color: "#1f2937"
      });
      if (device.type === "supply") {
        this.deviceGraphics.poly([
          centerX,
          centerY - half,
          centerX - half,
          centerY + half,
          centerX + half,
          centerY + half
        ]);
      } else if (device.type === "unload") {
        this.deviceGraphics.roundRect(centerX - half, centerY - half, size, size, 4);
      } else if (device.type === "charger") {
        this.deviceGraphics.circle(centerX, centerY, half);
      } else if (device.type === "queue") {
        this.deviceGraphics.roundRect(centerX - half, centerY - half, size, size * 0.76, 6);
      } else {
        this.deviceGraphics.poly([
          centerX,
          centerY - half,
          centerX - half,
          centerY,
          centerX,
          centerY + half,
          centerX + half,
          centerY
        ]);
      }
      this.deviceGraphics.fill({ color, alpha: device.config.enabled ? 0.9 : 0.35 });
      this.deviceGraphics.stroke();

      if (!device.config.enabled) {
        this.deviceGraphics.setStrokeStyle({
          width: 2,
          color: "#dc2626"
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
    const devices = project.devices.filter((item) => selection.deviceIds.includes(item.id));
    devices.forEach((device) => {
      this.highlightDevice(device);
    });
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

  private drawArrow(fromX: number, fromY: number, toX: number, toY: number, color: string) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 6) {
      return;
    }
    const angle = Math.atan2(dy, dx);
    const head = Math.max(4, this.cellPixel * 0.24);
    const centerX = (fromX + toX) / 2;
    const centerY = (fromY + toY) / 2;

    const leftX = centerX - Math.cos(angle - Math.PI / 6) * head;
    const leftY = centerY - Math.sin(angle - Math.PI / 6) * head;
    const rightX = centerX - Math.cos(angle + Math.PI / 6) * head;
    const rightY = centerY - Math.sin(angle + Math.PI / 6) * head;

    this.arrowGraphics.poly([centerX, centerY, leftX, leftY, rightX, rightY]);
    this.arrowGraphics.fill({ color, alpha: 0.95 });
  }

  private highlightCell(x: number, y: number) {
    this.selectionGraphics.rect(
      x * this.cellPixel,
      y * this.cellPixel,
      this.cellPixel,
      this.cellPixel
    );
    this.selectionGraphics.fill({ color: "#fbbf24", alpha: 0.26 });
    this.selectionGraphics.setStrokeStyle({ width: 2, color: "#f59e0b" });
    this.selectionGraphics.stroke();
  }

  private highlightPathPoint(x: number, y: number) {
    this.selectionGraphics.circle(
      x * this.cellPixel + this.cellPixel / 2,
      y * this.cellPixel + this.cellPixel / 2,
      Math.max(5, this.cellPixel * 0.45)
    );
    this.selectionGraphics.setStrokeStyle({ width: 2, color: "#ef4444" });
    this.selectionGraphics.stroke();
  }

  private highlightDevice(device: MapDevice) {
    this.selectionGraphics.rect(
      device.x * this.cellPixel + this.cellPixel * 0.1,
      device.y * this.cellPixel + this.cellPixel * 0.1,
      this.cellPixel * 0.8,
      this.cellPixel * 0.8
    );
    this.selectionGraphics.setStrokeStyle({ width: 2, color: "#ef4444" });
    this.selectionGraphics.stroke();
  }

  private applyView() {
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

    const baseColor = "#f8fbff";
    const nodeColor = "#dbeafe";
    const nodeBorder = "#93c5fd";
    const gridLine = "#d6deeb";
    const mapWidth = this.project.grid.width;
    const { base } = this.project.layers;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.flags.showNavBlock) {
      for (let y = 0; y < cellsY; y += 1) {
        for (let x = 0; x < cellsX; x += 1) {
          const mapX = startX + x;
          const mapY = startY + y;
          const value = base[mapY * mapWidth + mapX];
          if (value !== 1) {
            continue;
          }
          ctx.fillStyle = nodeColor;
          ctx.fillRect(
            x * this.cellPixel + 1,
            y * this.cellPixel + 1,
            this.cellPixel - 2,
            this.cellPixel - 2
          );
          ctx.strokeStyle = nodeBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(
            x * this.cellPixel + 1.5,
            y * this.cellPixel + 1.5,
            this.cellPixel - 3,
            this.cellPixel - 3
          );
        }
      }
    }

    if (this.flags.showGrid) {
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
    }

    return Texture.from(canvas);
  }
}
