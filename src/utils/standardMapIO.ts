import { resolveMapId } from "@/lib/mapIdentity";
import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { normalizeRobotPathColors } from "@/lib/pathColoring";
import {
  type Attr,
  type AutoEquipment,
  type CellCoord,
  type CellMarkMetadata,
  type ChargerEquipment,
  createDefaultCellMarkMetadata,
  createEmptyProject,
  type DeviceConfig,
  Direction,
  type Equipment,
  type HoistEquipment,
  type LoadEquipment,
  type Location,
  type MapDevice,
  type MapInterface,
  type MapProject,
  type Mark,
  type Path,
  type PathDirection,
  type PathEdgeMetadata,
  type RobotPath,
  type SorterEquipment,
  Tag,
  Type,
  type UnloadEquipment,
} from "@/types/map";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const cellKey = (x: number, y: number) => `${x},${y}`;
const pathEdgeKey = (start: CellCoord, end: CellCoord) => `${cellKey(start.x, start.y)}>${cellKey(end.x, end.y)}`;

const roundTo = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizePositiveNumber = (value: unknown, fallback: number) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

const normalizeFiniteNumber = (value: unknown, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const normalizeInteger = (value: unknown, fallback = 0) => Math.round(normalizeFiniteNumber(value, fallback));

const normalizeString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const normalizeNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .map((item) => Number(item))
    : [];

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const isDirection = (value: unknown): value is Direction =>
  value === Direction.E || value === Direction.N || value === Direction.S || value === Direction.W;

const isTag = (value: unknown): value is Tag => Object.values(Tag).includes(value as Tag);

const normalizeLocation = (value: unknown): Location => {
  if (!isRecord(value)) {
    return {
      mark: null,
      tag: null,
      facing: [],
      capacity: null,
    };
  }

  const label = typeof value.label === "string" && value.label.length > 0 ? value.label : undefined;
  return {
    ...(label ? { label } : {}),
    mark: normalizeNullableNumber(value.mark),
    tag: isTag(value.tag) ? value.tag : null,
    facing: normalizeNumberArray(value.facing),
    capacity: normalizeNullableNumber(value.capacity),
  };
};

const normalizeAttr = (value: unknown): Attr => {
  if (!isRecord(value)) {
    return createDefaultCellMarkMetadata("temp-code").attr;
  }

  return {
    dockable: value.dockable !== false,
    rotatable: value.rotatable !== false,
    loadSpeed: null,
    unloadSpeed: null,
    loadAcceleration: null,
    unloadAcceleration: null,
  };
};

const normalizeMarkMetadata = (mark: unknown, fallbackCode: string): CellMarkMetadata => {
  const defaults = createDefaultCellMarkMetadata(fallbackCode);
  if (!isRecord(mark)) {
    return defaults;
  }

  const code = typeof mark.code === "string" && mark.code.length > 0 ? mark.code : fallbackCode;
  return {
    code,
    type: mark.type === Type.Mr ? Type.Mr : Type.Mr,
    bb: null,
    z: normalizeFiniteNumber(mark.z, 0),
    heading: normalizeNumberArray(mark.heading),
    lock: Boolean(mark.lock),
    location: normalizeLocation(mark.location),
    trafficRule: null,
    attr: normalizeAttr(mark.attr),
  };
};

const resolveBlockSize = (resolution: number, interval: number, fallback = 40) => {
  if (resolution <= 0 || interval <= 0) {
    return fallback;
  }
  const blockSize = interval / resolution;
  return Number.isFinite(blockSize) && blockSize > 0 ? blockSize : fallback;
};

const directionToOffset = (direction: Direction): CellCoord => {
  if (direction === Direction.N) {
    return { x: 0, y: -1 };
  }
  if (direction === Direction.S) {
    return { x: 0, y: 1 };
  }
  if (direction === Direction.W) {
    return { x: -1, y: 0 };
  }
  return { x: 1, y: 0 };
};

const degreesToDirection = (degrees: number): Direction => {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized >= 45 && normalized < 135) {
    return Direction.N;
  }
  if (normalized >= 135 && normalized < 225) {
    return Direction.W;
  }
  if (normalized >= 225 && normalized < 315) {
    return Direction.S;
  }
  return Direction.E;
};

const directionToDegrees = (direction: Direction) => {
  if (direction === Direction.N) {
    return 90;
  }
  if (direction === Direction.W) {
    return 180;
  }
  if (direction === Direction.S) {
    return 270;
  }
  return 0;
};

const uniqueBoundCells = (cells: CellCoord[]) => {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = cellKey(cell.x, cell.y);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const inferEquipmentCell = (
  equipment: { x?: unknown; y?: unknown; direction?: unknown; aboutBlock?: unknown },
  codeToCoord: Map<string, CellCoord>,
) => {
  const direction = isDirection(equipment.direction) ? equipment.direction : Direction.E;
  const aboutBlocks = Array.isArray(equipment.aboutBlock)
    ? equipment.aboutBlock.filter((item): item is string => typeof item === "string")
    : typeof equipment.aboutBlock === "string"
      ? [equipment.aboutBlock]
      : [];

  for (const code of aboutBlocks) {
    const bound = codeToCoord.get(code);
    if (!bound) {
      continue;
    }
    const offset = directionToOffset(direction);
    return {
      x: bound.x + offset.x,
      y: bound.y + offset.y,
    };
  }

  return {
    x: normalizeInteger(equipment.x, 0),
    y: normalizeInteger(equipment.y, 0),
  };
};

const createImportedDevice = (
  equipment: Equipment | AutoEquipment,
  type: MapDevice["type"],
  configPatch: Partial<DeviceConfig>,
  codeToCoord: Map<string, CellCoord>,
  fallbackName: string,
): MapDevice => {
  const { x, y } = inferEquipmentCell(equipment, codeToCoord);
  const direction = isDirection(equipment.direction) ? equipment.direction : Direction.E;
  const aboutBlocks = Array.isArray(equipment.aboutBlock)
    ? equipment.aboutBlock
    : typeof equipment.aboutBlock === "string"
      ? [equipment.aboutBlock]
      : [];
  const boundCells = uniqueBoundCells(
    aboutBlocks
      .map((code) => codeToCoord.get(code))
      .filter((item): item is CellCoord => Boolean(item))
      .map((item) => ({ x: item.x, y: item.y })),
  );

  return {
    id: typeof equipment.id === "string" && equipment.id.length > 0 ? equipment.id : fallbackName,
    type,
    name: typeof equipment.name === "string" && equipment.name.length > 0 ? equipment.name : fallbackName,
    x,
    y,
    config: {
      enabled: true,
      hardwareId: "",
      speedLimit: 1.2,
      maxQueue: 4,
      directionDeg: directionToDegrees(direction),
      ...configPatch,
      boundCells,
      left: equipment.left,
      right: equipment.right,
    },
  };
};

const tagToCellValue = (tag: Tag | null) => {
  if (tag === Tag.QueuePort) {
    return 2;
  }
  if (tag === Tag.WaitPort) {
    return 3;
  }
  return 1;
};

const inferEdgeSuffix = (start: CellCoord, end: CellCoord) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "e" : "w";
  }
  return dy >= 0 ? "s" : "n";
};

const buildPrimaryBoundCells = (device: MapDevice, activeCellKeys: Set<string>) => {
  const explicit = uniqueBoundCells(
    (device.config.boundCells ?? []).filter((cell) => activeCellKeys.has(cellKey(cell.x, cell.y))),
  );
  if (explicit.length > 0) {
    return explicit;
  }

  const direction = degreesToDirection(device.config.directionDeg);
  const preferredOffset = directionToOffset(direction);
  const preferred = {
    x: device.x - preferredOffset.x,
    y: device.y - preferredOffset.y,
  };
  if (activeCellKeys.has(cellKey(preferred.x, preferred.y))) {
    return [preferred];
  }

  const adjacentCandidates = [
    { x: device.x - 1, y: device.y },
    { x: device.x + 1, y: device.y },
    { x: device.x, y: device.y - 1 },
    { x: device.x, y: device.y + 1 },
  ].filter((cell) => activeCellKeys.has(cellKey(cell.x, cell.y)));

  return uniqueBoundCells(adjacentCandidates);
};

const buildDeviceTagIndex = (project: MapProject) => {
  const tagIndex = new Map<string, Tag>();
  const activeCellKeys = new Set<string>();

  project.layers.base.forEach((value, index) => {
    if (value === 0) {
      return;
    }
    const x = index % project.grid.width;
    const y = Math.floor(index / project.grid.width);
    activeCellKeys.add(cellKey(x, y));
  });

  project.devices.forEach((device) => {
    const boundCells = buildPrimaryBoundCells(device, activeCellKeys);
    const tag =
      device.type === "charger"
        ? Tag.ChargerPort
        : device.type === "unload"
          ? device.config.unloadMode === "multi-sort"
            ? Tag.SorterPort
            : Tag.UnloadPort
          : device.config.supplyMode === "elevator"
            ? Tag.LiftPort
            : device.config.supplyMode === "auto"
              ? Tag.AutoPort
              : Tag.LoadPort;

    boundCells.forEach((cell) => {
      tagIndex.set(cellKey(cell.x, cell.y), tag);
    });
  });

  return { tagIndex, activeCellKeys };
};

export const isStandardMapInterface = (value: unknown): value is MapInterface =>
  isRecord(value) && isRecord(value.info) && Array.isArray(value.marks) && Array.isArray(value.paths);

export const projectFromStandardMap = (input: MapInterface): MapProject => {
  const mapName = normalizeString(input.info?.name, "factory-map").trim() || "factory-map";
  const mapId = resolveMapId(input.id, mapName);
  const scene = input.info?.simulation ? "simulation" : "production";
  const intervalMeter = normalizePositiveNumber(input.info?.interval, 550) / 1000;
  const resolution = normalizePositiveNumber(input.info?.resolution, intervalMeter / 40);
  const blockSize = resolveBlockSize(resolution, intervalMeter, 40);
  const widthFromInfo = Math.max(1, normalizeInteger(normalizeFiniteNumber(input.info?.width, blockSize) / blockSize, 1));
  const heightFromInfo = Math.max(1, normalizeInteger(normalizeFiniteNumber(input.info?.height, blockSize) / blockSize, 1));
  const project = createEmptyProject(widthFromInfo, heightFromInfo, scene, mapName, mapId);
  const createdAt = normalizeString(input.info?.create_date, project.meta.createdAt);
  const updatedAt = normalizeString(input.info?.modify_date, createdAt || project.meta.updatedAt);
  const worldHeight = normalizeFiniteNumber(input.info?.height, heightFromInfo * blockSize) * resolution;

  const codeToCoord = new Map<string, CellCoord>();
  const markMetadataByCell: Record<string, CellMarkMetadata> = {};
  let width = widthFromInfo;
  let height = heightFromInfo;

  input.marks.forEach((mark, index) => {
    const x = Math.max(0, Math.round(normalizeFiniteNumber(mark.x, 0) / intervalMeter - 0.5));
    const y = Math.max(0, Math.round((worldHeight - normalizeFiniteNumber(mark.y, 0)) / intervalMeter - 0.5));
    const fallbackCode = `mark-${x}-${y}-${index + 1}`;
    const normalizedMetadata = normalizeMarkMetadata(mark, fallbackCode);
    const key = cellKey(x, y);

    codeToCoord.set(normalizedMetadata.code, { x, y });
    markMetadataByCell[key] = normalizedMetadata;
    width = Math.max(width, x + 1);
    height = Math.max(height, y + 1);
  });

  const allEquipments = [
    ...input.loadEquipments,
    ...input.autoEquipments,
    ...input.hoistEquipments,
    ...input.unloadEquipments,
    ...input.sorterEquipments,
    ...input.chargerEquipments,
  ];

  allEquipments.forEach((equipment) => {
    const inferred = inferEquipmentCell(equipment, codeToCoord);
    width = Math.max(width, inferred.x + 1);
    height = Math.max(height, inferred.y + 1);
  });

  project.grid.width = width;
  project.grid.height = height;
  project.grid.cellSizeMeter = intervalMeter;
  project.layers.base = new Array(width * height).fill(0);
  project.meta.createdAt = createdAt;
  project.meta.updatedAt = updatedAt;
  project.meta.scene = scene;
  project.meta.tags = normalizeStringArray(input.info?.groups);
  project.protocol = {
    meta: isRecord(input.meta) ? input.meta : {},
    info: {
      key: normalizeString(input.info?.key, mapId),
      layer: normalizeInteger(input.info?.layer, 0),
      maxValue: normalizeFiniteNumber(input.info?.max_value, 1),
      lastModifyUser: normalizeString(input.info?.last_modify_user, ""),
      original: {
        x: normalizeFiniteNumber(input.info?.original?.x, 0),
        y: normalizeFiniteNumber(input.info?.original?.y, height * blockSize),
      },
      resolution,
      interval: Math.round(intervalMeter * 1000),
      blockSize,
    },
    collections: {
      basic: Array.isArray(input.basic) ? [...input.basic] : [],
      advanced: Array.isArray(input.advanced) ? [...input.advanced] : [],
      areas: Array.isArray(input.areas) ? [...input.areas] : [],
      arcs: Array.isArray(input.arcs) ? [...input.arcs] : [],
      traffic: Array.isArray(input.traffic) ? [...input.traffic] : [],
      devices: Array.isArray(input.devices) ? [...input.devices] : [],
      infos: Array.isArray(input.infos) ? [...input.infos] : [],
    },
    marks: markMetadataByCell,
    pathEdges: {},
  };

  Object.entries(markMetadataByCell).forEach(([key, metadata]) => {
    const [xText, yText] = key.split(",");
    const x = Number(xText);
    const y = Number(yText);
    project.layers.base[y * width + x] = tagToCellValue(metadata.location.tag);
  });

  const edgeMetadata: Record<string, PathEdgeMetadata> = {};
  const rawEdges: Array<{ start: CellCoord; end: CellCoord; path: Path }> = [];

  input.paths.forEach((path, index) => {
    const start = codeToCoord.get(path.start);
    const end = codeToCoord.get(path.end);
    if (!start || !end) {
      return;
    }
    const edgeKey = pathEdgeKey(start, end);
    edgeMetadata[edgeKey] = {
      code: typeof path.code === "string" && path.code.length > 0 ? path.code : `path-${index + 1}`,
      lock: Boolean(path.lock),
    };
    rawEdges.push({ start, end, path });
  });

  const visited = new Set<string>();
  const robotPaths: RobotPath[] = [];
  rawEdges.forEach(({ start, end, path }, index) => {
    const key = `${path.start}->${path.end}`;
    if (visited.has(key)) {
      return;
    }
    const reverseKey = `${path.end}->${path.start}`;
    const reverse = rawEdges.find((item) => item.path.start === path.end && item.path.end === path.start);
    const direction = reverse ? "bidirectional" : "oneway";
    visited.add(key);
    if (reverse) {
      visited.add(reverseKey);
    }
    robotPaths.push({
      id: typeof path.code === "string" && path.code.length > 0 ? path.code : `path-${index + 1}`,
      name: typeof path.code === "string" && path.code.length > 0 ? path.code : `Path-${index + 1}`,
      color: PATH_COLOR_PALETTE[robotPaths.length % PATH_COLOR_PALETTE.length],
      direction: direction as PathDirection,
      points: [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ],
    });
  });

  project.overlays.robotPaths = robotPaths.length > 0 ? normalizeRobotPathColors(robotPaths) : project.overlays.robotPaths;
  project.protocol.pathEdges = edgeMetadata;

  project.devices = [
    ...input.loadEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "supply",
        {
          supplyMode: "manual",
        },
        codeToCoord,
        `load-${index + 1}`,
      ),
    ),
    ...input.autoEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "supply",
        {
          supplyMode: "auto",
        },
        codeToCoord,
        `auto-${index + 1}`,
      ),
    ),
    ...input.hoistEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "supply",
        {
          supplyMode: "elevator",
        },
        codeToCoord,
        `hoist-${index + 1}`,
      ),
    ),
    ...input.unloadEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "unload",
        {
          unloadMode: "normal",
        },
        codeToCoord,
        `unload-${index + 1}`,
      ),
    ),
    ...input.sorterEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "unload",
        {
          unloadMode: "multi-sort",
        },
        codeToCoord,
        `sorter-${index + 1}`,
      ),
    ),
    ...input.chargerEquipments.map((equipment, index) =>
      createImportedDevice(
        equipment,
        "charger",
        {},
        codeToCoord,
        `charger-${index + 1}`,
      ),
    ),
  ];

  return project;
};

const buildMarkMetadataForCell = (
  project: MapProject,
  x: number,
  y: number,
  derivedTag: Tag | null,
): CellMarkMetadata => {
  const key = cellKey(x, y);
  const existing = project.protocol.marks[key];
  const fallback = createDefaultCellMarkMetadata(`mark-${x}-${y}`);
  const metadata = existing ?? fallback;
  const location = {
    ...metadata.location,
    tag: derivedTag ?? metadata.location.tag ?? null,
  };

  return {
    ...metadata,
    code: metadata.code || fallback.code,
    type: Type.Mr,
    bb: null,
    trafficRule: null,
    location,
  };
};

const buildMarkCoordinates = (project: MapProject, x: number, y: number) => ({
  x: roundTo((x + 0.5) * project.grid.cellSizeMeter),
  y: roundTo((project.grid.height - y - 0.5) * project.grid.cellSizeMeter),
});

const buildPathFromEdge = (
  startCode: string,
  endCode: string,
  start: CellCoord,
  end: CellCoord,
  metadata?: PathEdgeMetadata,
): Path => ({
  code: metadata?.code || `${startCode}-${inferEdgeSuffix(start, end)}`,
  start: startCode,
  end: endCode,
  lock: metadata?.lock ?? false,
});

const buildEquipmentPayload = (
  project: MapProject,
  device: MapDevice,
  aboutBlock: string,
  direction: Direction,
) => {
  const blockSize = normalizePositiveNumber(project.protocol.info.blockSize, 40);
  const heightPx = Math.round(project.grid.height * blockSize);
  const originX = project.protocol.info.original.x;
  const originY = project.protocol.info.original.y || heightPx;
  const boundsMinY = originY - heightPx;

  return {
    id: device.id,
    x: originX + device.x * blockSize + blockSize / 2,
    y: boundsMinY + device.y * blockSize + blockSize / 2,
    name: device.name,
    aboutBlock,
    direction,
    left: device.config.left,
    right: device.config.right,
  };
};

export const projectToStandardMap = (project: MapProject): MapInterface => {
  const blockSize = normalizePositiveNumber(project.protocol.info.blockSize, 40);
  const interval = normalizePositiveNumber(project.protocol.info.interval, Math.round(project.grid.cellSizeMeter * 1000));
  const intervalMeter = interval / 1000;
  const resolution = normalizePositiveNumber(project.protocol.info.resolution, intervalMeter / blockSize);
  const widthPx = Math.round(project.grid.width * blockSize);
  const heightPx = Math.round(project.grid.height * blockSize);
  const { tagIndex, activeCellKeys } = buildDeviceTagIndex(project);
  const marks: Mark[] = [];
  const markCodeByCell = new Map<string, string>();

  for (let y = 0; y < project.grid.height; y += 1) {
    for (let x = 0; x < project.grid.width; x += 1) {
      const baseValue = project.layers.base[y * project.grid.width + x];
      if (baseValue === 0) {
        continue;
      }

      const key = cellKey(x, y);
      const derivedTag =
        baseValue === 2 ? Tag.QueuePort : baseValue === 3 ? Tag.WaitPort : (tagIndex.get(key) ?? null);
      const metadata = buildMarkMetadataForCell(project, x, y, derivedTag);
      const coordinates = buildMarkCoordinates(project, x, y);

      markCodeByCell.set(key, metadata.code);
      marks.push({
        ...metadata,
        ...coordinates,
      });
    }
  }

  const pathSet = new Set<string>();
  const paths: Path[] = [];
  project.overlays.robotPaths.forEach((robotPath) => {
    for (let index = 0; index < robotPath.points.length - 1; index += 1) {
      const start = robotPath.points[index];
      const end = robotPath.points[index + 1];
      const startKey = cellKey(start.x, start.y);
      const endKey = cellKey(end.x, end.y);
      const startCode = markCodeByCell.get(startKey);
      const endCode = markCodeByCell.get(endKey);
      if (!startCode || !endCode || startCode === endCode) {
        continue;
      }

      const forwardId = `${startCode}->${endCode}`;
      if (!pathSet.has(forwardId)) {
        const metadata = project.protocol.pathEdges[pathEdgeKey(start, end)];
        paths.push(buildPathFromEdge(startCode, endCode, start, end, metadata));
        pathSet.add(forwardId);
      }

      if (robotPath.direction === "bidirectional") {
        const reverseId = `${endCode}->${startCode}`;
        if (!pathSet.has(reverseId)) {
          const reverseMetadata = project.protocol.pathEdges[pathEdgeKey(end, start)];
          paths.push(buildPathFromEdge(endCode, startCode, end, start, reverseMetadata));
          pathSet.add(reverseId);
        }
      }
    }
  });

  const loadEquipments: LoadEquipment[] = [];
  const autoEquipments: AutoEquipment[] = [];
  const hoistEquipments: HoistEquipment[] = [];
  const unloadEquipments: UnloadEquipment[] = [];
  const sorterEquipments: SorterEquipment[] = [];
  const chargerEquipments: ChargerEquipment[] = [];

  project.devices.forEach((device) => {
    const direction = degreesToDirection(device.config.directionDeg);
    const boundCells = buildPrimaryBoundCells(device, activeCellKeys);
    const aboutBlocks = boundCells
      .map((cell) => markCodeByCell.get(cellKey(cell.x, cell.y)))
      .filter((item): item is string => typeof item === "string" && item.length > 0);

    if (aboutBlocks.length === 0) {
      return;
    }

    if (device.type === "supply") {
      if (device.config.supplyMode === "auto") {
        autoEquipments.push({
          ...buildEquipmentPayload(project, device, aboutBlocks[0], direction),
          aboutBlock: aboutBlocks,
        });
        return;
      }
      if (device.config.supplyMode === "elevator") {
        hoistEquipments.push(buildEquipmentPayload(project, device, aboutBlocks[0], direction));
        return;
      }
      loadEquipments.push(buildEquipmentPayload(project, device, aboutBlocks[0], direction));
      return;
    }

    if (device.type === "unload") {
      if (device.config.unloadMode === "multi-sort") {
        sorterEquipments.push(buildEquipmentPayload(project, device, aboutBlocks[0], direction));
        return;
      }
      unloadEquipments.push(buildEquipmentPayload(project, device, aboutBlocks[0], direction));
      return;
    }

    chargerEquipments.push(buildEquipmentPayload(project, device, aboutBlocks[0], direction));
  });

  const now = new Date().toISOString();

  return {
    id: project.meta.id,
    meta: isRecord(project.protocol.meta) ? project.protocol.meta : {},
    info: {
      name: project.meta.name,
      key: project.protocol.info.key || project.meta.id,
      layer: project.protocol.info.layer,
      width: widthPx,
      height: heightPx,
      blocks: marks.length,
      max_value: project.protocol.info.maxValue,
      resolution,
      simulation: project.meta.scene === "simulation",
      interval,
      original: {
        x: project.protocol.info.original.x,
        y: project.protocol.info.original.y || heightPx,
      },
      create_date: project.meta.createdAt || now,
      modify_date: project.meta.updatedAt || now,
      last_modify_user: project.protocol.info.lastModifyUser,
      groups: [...project.meta.tags],
    },
    basic: [...project.protocol.collections.basic],
    advanced: [...project.protocol.collections.advanced],
    marks,
    areas: [...project.protocol.collections.areas],
    paths,
    arcs: [...project.protocol.collections.arcs],
    traffic: [...project.protocol.collections.traffic],
    devices: [...project.protocol.collections.devices],
    infos: [...project.protocol.collections.infos],
    loadEquipments,
    autoEquipments,
    hoistEquipments,
    unloadEquipments,
    sorterEquipments,
    chargerEquipments,
  };
};
