import type { CellValue, PlatformPanel } from "@/types/map";

const cellIndex = (x: number, y: number, width: number) => y * width + x;

type PanelCandidate = Pick<PlatformPanel, "spec" | "width" | "height" | "rotated">;
type GreedyScanOrder = "row-major" | "col-major";

// 面板规划会把“是否先放 2x4、优先横放还是竖放”当成不同策略逐一尝试。
const PANEL_STRATEGIES: PanelCandidate[][] = [
  [
    { spec: "2x4", width: 4, height: 2, rotated: false },
    { spec: "2x4", width: 2, height: 4, rotated: true },
  ],
  [
    { spec: "2x4", width: 2, height: 4, rotated: true },
    { spec: "2x4", width: 4, height: 2, rotated: false },
  ],
  [],
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

// 用最大匹配为剩余可用格尽量生成更多 1x2 面板。
// 整体流程可以按下面理解：
// 1. 先扣掉已经被 2x4 面板占用的格子，得到 remaining cells。
// 2. 把 remaining cells 按棋盘黑白格拆成二分图，边表示两个相邻格可拼成 1x2。
// 3. 用 Hopcroft-Karp 反复执行“BFS 分层 + DFS 增广”，求出最大匹配。
// 4. 把每一条匹配边还原成一个真实的 1x2 平台面板。
// https://brilliant.org/wiki/hopcroft-karp/
const buildDominoPanels = (occupied: boolean[], used: boolean[], gridWidth: number, gridHeight: number) => {
  const total = gridWidth * gridHeight;
  // available 表示“还能参与 1x2 面板配对”的剩余格：
  // 必须原本可用，且还没有被前面的 2x4 面板占掉。
  const available = occupied.map((cell, index) => cell && !used[index]);
  // neighbors[left] 记录某个左侧格能连到哪些相邻格。
  // 这些边就表示“这两个格可以拼成一个 1x2 面板”。
  const neighbors: number[][] = new Array(total).fill(null).map(() => []);
  // leftNodes 是二分图的左侧节点集合。
  // 这里用棋盘染色把格子分成两组，只取 (x + y) 为偶数的一半放进左侧。
  // 这样任意上下左右相邻的两个格子都会一左一右，满足二分图结构。
  const leftNodes: number[] = [];

  console.warn('buildDominoPanels')

  // 第一步：把剩余格子建成二分图。
  // 节点是“尚未被占用的格子”，边是“上下左右相邻，因此可组成 1x2 面板”的关系。
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

  // pairLeft[left] = right：左侧格当前匹配到的右侧格索引，-1 表示还未匹配。
  const pairLeft = new Array<number>(total).fill(-1);
  // pairRight[right] = left：右侧格当前被哪个左侧格占用，-1 表示还未匹配。
  const pairRight = new Array<number>(total).fill(-1);
  // dist 只在 BFS 分层时对左侧格有意义，记录它位于第几层，-1 表示本轮未访问。
  const dist = new Array<number>(total).fill(-1);

  // 第二步：Hopcroft-Karp 的 BFS 分层。
  // 目标不是直接改配对，而是从“当前未匹配的左节点”同时出发，
  // 找出是否还存在通往“未匹配右节点”的增广路，并给左节点打上层级。
  // 后面的 DFS 只沿着这些最短层级前进，避免做很多无效回溯。
  const bfs = () => {
    // queue 存的是“待继续扩展的左节点”。
    // BFS 里虽然会看到右节点，但真正入队的始终是通过匹配边回跳到的左节点。
    const queue: number[] = [];
    // head 是手写队列的读指针，避免频繁 shift() 带来的额外开销。
    let head = 0;
    // 只要本轮分层过程中看到了空闲右节点，就说明至少存在一条增广路。
    let foundFreeRight = false;

    // 所有尚未匹配的左节点都是本轮增广的起点，层级记为 0。
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
      // 从当前左节点出发，枚举它能尝试配对的所有右节点。
      neighbors[node].forEach((next) => {
        const paired = pairRight[next];
        if (paired === -1) {
          // 遇到空闲右节点，说明至少存在一条增广路，可以进入 DFS 实际调整匹配。
          foundFreeRight = true;
          return;
        }
        if (dist[paired] !== -1) {
          return;
        }
        // 右节点如果已被占用，就沿着“右 -> 已匹配左”继续扩展下一层。
        // 这一步是在寻找可以重排旧匹配、从而腾出位置给新节点的路径。
        dist[paired] = dist[node] + 1;
        queue.push(paired);
      });
    }

    return foundFreeRight;
  };

  // 第三步：DFS 按 BFS 建好的分层图实际做增广。
  // 它会尝试给当前左节点找一个右节点：
  // 1. 如果右节点空闲，直接配上；
  // 2. 如果右节点已被占用，就递归看看原来的左节点能不能改配到别处。
  // 一旦这种“腾挪”成功，整条路径上的匹配关系都会被更新，匹配总数 +1。
  const dfs = (node: number): boolean => {
    for (const next of neighbors[node]) {
      const paired = pairRight[next];
      // 这句条件表示“当前 node 是否能最终拿到 next”。
      // 左半边：paired === -1，next 目前是空闲右节点，当前 node 可以直接与它匹配。
      // 右半边：dist[paired] === dist[node] + 1 && dfs(paired)
      // next 虽然已被 paired 占用，但 paired 正好位于 BFS 标出的下一层，
      // 并且递归后 paired 能改配到别处，于是 next 就能被腾出来给当前 node。
      if (paired === -1 || (dist[paired] === dist[node] + 1 && dfs(paired))) {
        // 走到这里说明 next 最终能腾出来给当前 node 使用，无论是它本来就空闲，还是通过递归重排了旧配对。
        pairLeft[node] = next;
        pairRight[next] = node;
        return true;
      }
    }
    // 这一层走不通就剪枝，避免同一轮 DFS 反复从失败节点出发重试。
    dist[node] = -1;
    return false;
  };

  // 只要 BFS 还能找到增广路，就持续尝试扩充匹配，
  // 直到剩余格子里再也找不到新的 1x2 配对为止。
  while (bfs()) {
    leftNodes.forEach((node) => {
      if (pairLeft[node] === -1) {
        dfs(node);
      }
    });
  }

  // 第四步：把匹配结果还原成实际面板。
  // 每个 left -> right 匹配对应一个 1x2 面板，可能是横放，也可能是竖放。
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

  // 先追求覆盖率
  if (nextLeftover !== currentLeftover) {
    return nextLeftover < currentLeftover ? next : current;
  }
  // 再追求大板数量
  if (nextLarge !== currentLarge) {
    return nextLarge > currentLarge ? next : current;
  }
  // 最后才比较总面板块数。
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
