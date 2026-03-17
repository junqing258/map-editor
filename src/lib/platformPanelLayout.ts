import type { CellValue, PlatformPanel } from "@/types/map";

const cellIndex = (x: number, y: number, width: number) => y * width + x;

type PanelCandidate = Pick<PlatformPanel, "spec" | "width" | "height" | "rotated">;
type GreedyScanOrder = "row-major" | "col-major";

// 面板规划会把“是否先放 2x4、优先横放还是竖放”当成不同策略逐一尝试。
const PANEL_STRATEGIES: PanelCandidate[][] = [
  [],
  [
    { spec: "2x4", width: 4, height: 2, rotated: false },
    { spec: "2x4", width: 2, height: 4, rotated: true },
  ],
  [
    { spec: "2x4", width: 2, height: 4, rotated: true },
    { spec: "2x4", width: 4, height: 2, rotated: false },
  ],
];

// 除了面板方向策略，还会比较扫描顺序，降低单一路径贪心造成的局部最优风险。
const PANEL_SCAN_ORDERS: GreedyScanOrder[] = ["row-major", "col-major"];

const panelArea = (panel: Pick<PlatformPanel, "width" | "height">) => panel.width * panel.height;

// 当前版本里，只要 base cell > 0，就认为该格子可以参与实际面板铺排。
const buildOccupancy = (base: CellValue[]) => base.map((cell) => cell > 0);

const canPlacePanel = (
  occupied: boolean[],
  used: boolean[],
  gridWidth: number,
  gridHeight: number,
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
) => {
  // 候选面板必须完全落在地图范围内，且覆盖到的格子都还可用。
  if (x < 0 || y < 0 || x + panelWidth > gridWidth || y + panelHeight > gridHeight) {
    return false;
  }
  for (let row = 0; row < panelHeight; row += 1) {
    for (let col = 0; col < panelWidth; col += 1) {
      const idx = cellIndex(x + col, y + row, gridWidth);
      if (!occupied[idx] || used[idx]) {
        return false;
      }
    }
  }
  return true;
};

const markPanelCells = (
  used: boolean[],
  gridWidth: number,
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
) => {
  // 面板一旦落位，就把矩形区域整体标记为 used，后续不能重复占用。
  for (let row = 0; row < panelHeight; row += 1) {
    for (let col = 0; col < panelWidth; col += 1) {
      used[cellIndex(x + col, y + row, gridWidth)] = true;
    }
  }
};

const runLargePanelGreedy = (
  occupied: boolean[],
  gridWidth: number,
  gridHeight: number,
  strategy: PanelCandidate[],
  scanOrder: GreedyScanOrder,
) => {
  const used = new Array(occupied.length).fill(false);
  const panels: PlatformPanel[] = [];

  const scanCell = (x: number, y: number) => {
    const idx = cellIndex(x, y, gridWidth);
    if (!occupied[idx] || used[idx]) {
      return;
    }
    const candidate = strategy.find((item) =>
      canPlacePanel(occupied, used, gridWidth, gridHeight, x, y, item.width, item.height),
    );
    if (!candidate) {
      return;
    }
    markPanelCells(used, gridWidth, x, y, candidate.width, candidate.height);
    panels.push({
      id: "",
      x,
      y,
      width: candidate.width,
      height: candidate.height,
      spec: candidate.spec,
      rotated: candidate.rotated,
    });
  };

  // 扫描顺序也会影响“谁先占到起点”，因此把按行扫和按列扫都纳入候选方案。
  if (scanOrder === "col-major") {
    for (let x = 0; x < gridWidth; x += 1) {
      for (let y = 0; y < gridHeight; y += 1) {
        scanCell(x, y);
      }
    }
  } else {
    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        scanCell(x, y);
      }
    }
  }

  return { used, panels };
};

const buildDominoPanels = (occupied: boolean[], used: boolean[], gridWidth: number, gridHeight: number) => {
  const total = gridWidth * gridHeight;
  const available = occupied.map((cell, index) => cell && !used[index]);
  const neighbors: number[][] = new Array(total).fill(null).map(() => []);
  const leftNodes: number[] = [];

  // 这里把剩余可用格抽象成二分图，边表示两个相邻格可以组成 1x2 面板。
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const idx = cellIndex(x, y, gridWidth);
      if (!available[idx] || (x + y) % 2 !== 0) {
        continue;
      }
      leftNodes.push(idx);
      const adjacent = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];
      adjacent.forEach((point) => {
        if (point.x < 0 || point.y < 0 || point.x >= gridWidth || point.y >= gridHeight) {
          return;
        }
        const nextIndex = cellIndex(point.x, point.y, gridWidth);
        if (available[nextIndex]) {
          neighbors[idx].push(nextIndex);
        }
      });
    }
  }

  const pairLeft = new Array<number>(total).fill(-1);
  const pairRight = new Array<number>(total).fill(-1);
  const dist = new Array<number>(total).fill(-1);

  const bfs = () => {
    // Hopcroft-Karp 的 BFS：分层寻找还能继续增广的最短路径。
    const queue: number[] = [];
    let head = 0;
    let foundFreeRight = false;

    leftNodes.forEach((node) => {
      if (pairLeft[node] === -1) {
        dist[node] = 0;
        queue.push(node);
      } else {
        dist[node] = -1;
      }
    });

    while (head < queue.length) {
      const node = queue[head];
      head += 1;
      neighbors[node].forEach((next) => {
        const paired = pairRight[next];
        if (paired === -1) {
          foundFreeRight = true;
          return;
        }
        if (dist[paired] !== -1) {
          return;
        }
        dist[paired] = dist[node] + 1;
        queue.push(paired);
      });
    }

    return foundFreeRight;
  };

  const dfs = (node: number): boolean => {
    // DFS 沿着分层图尝试增广，让更多剩余格被 1x2 配对消化。
    for (const next of neighbors[node]) {
      const paired = pairRight[next];
      if (paired === -1 || (dist[paired] === dist[node] + 1 && dfs(paired))) {
        pairLeft[node] = next;
        pairRight[next] = node;
        return true;
      }
    }
    dist[node] = -1;
    return false;
  };

  while (bfs()) {
    leftNodes.forEach((node) => {
      if (pairLeft[node] === -1) {
        dfs(node);
      }
    });
  }

  const panels: PlatformPanel[] = [];
  leftNodes.forEach((left) => {
    const right = pairLeft[left];
    if (right === -1) {
      return;
    }
    const leftX = left % gridWidth;
    const leftY = Math.floor(left / gridWidth);
    const rightX = right % gridWidth;
    const rightY = Math.floor(right / gridWidth);
    const x = Math.min(leftX, rightX);
    const y = Math.min(leftY, rightY);
    panels.push({
      id: "",
      x,
      y,
      width: Math.abs(leftX - rightX) + 1,
      height: Math.abs(leftY - rightY) + 1,
      spec: "1x2",
      rotated: leftX === rightX,
    });
  });

  return panels;
};

const normalizePanels = (panels: PlatformPanel[]) =>
  panels
    .map((panel, index) => ({
      ...panel,
      // 统一重新编号，避免中间策略的临时结果影响最终比较。
      id: `panel-${index + 1}`,
    }))
    .sort((a, b) => {
      // 先按坐标排序，让渲染顺序和布局比较都保持稳定。
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      if (a.x !== b.x) {
        return a.x - b.x;
      }
      if (a.spec !== b.spec) {
        return a.spec.localeCompare(b.spec);
      }
      if (a.height !== b.height) {
        return a.height - b.height;
      }
      return a.width - b.width;
    });

const chooseBetterLayout = (next: PlatformPanel[], current: PlatformPanel[] | null, occupiedCount: number) => {
  if (!current) {
    return next;
  }
  const nextCovered = next.reduce((acc, panel) => acc + panelArea(panel), 0);
  const currentCovered = current.reduce((acc, panel) => acc + panelArea(panel), 0);
  const nextLarge = next.filter((panel) => panel.spec === "2x4").length;
  const currentLarge = current.filter((panel) => panel.spec === "2x4").length;
  const nextLeftover = occupiedCount - nextCovered;
  const currentLeftover = occupiedCount - currentCovered;

  // 先追求覆盖率，再追求大板数量，最后才比较总面板块数。
  if (nextLeftover !== currentLeftover) {
    return nextLeftover < currentLeftover ? next : current;
  }
  if (nextLarge !== currentLarge) {
    return nextLarge > currentLarge ? next : current;
  }
  if (next.length !== current.length) {
    return next.length < current.length ? next : current;
  }
  return current;
};

export const buildPlatformPanelLayout = (base: CellValue[], gridWidth: number, gridHeight: number) => {
  const occupied = buildOccupancy(base);
  const occupiedCount = occupied.reduce((acc, cell) => (cell ? acc + 1 : acc), 0);
  let bestPanels: PlatformPanel[] | null = null;

  // 钢平台轮廓对“先横后竖 / 先竖后横”以及“按行扫 / 按列扫”都可能敏感，所以组合尝试。
  PANEL_STRATEGIES.forEach((strategy) => {
    PANEL_SCAN_ORDERS.forEach((scanOrder) => {
      const largePlan = runLargePanelGreedy(occupied, gridWidth, gridHeight, strategy, scanOrder);
      const dominoPanels = buildDominoPanels(occupied, largePlan.used, gridWidth, gridHeight);
      const candidate = normalizePanels([...largePlan.panels, ...dominoPanels]);
      bestPanels = chooseBetterLayout(candidate, bestPanels, occupiedCount);
    });
  });

  return bestPanels ?? [];
};

export const arePanelsEqual = (left: PlatformPanel[], right: PlatformPanel[]) =>
  left.length === right.length &&
  left.every((panel, index) => {
    const other = right[index];
    return (
      other &&
      panel.x === other.x &&
      panel.y === other.y &&
      panel.width === other.width &&
      panel.height === other.height &&
      panel.spec === other.spec &&
      panel.rotated === other.rotated
    );
  });
