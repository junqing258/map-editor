import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import type { RobotPath } from "@/types/map";

const toPointKey = (x: number, y: number) => `${x},${y}`;

const getPathStartKey = (path: RobotPath) => {
  const start = path.points[0];
  return start ? toPointKey(start.x, start.y) : null;
};

const getPathEndKey = (path: RobotPath) => {
  const end = path.points[path.points.length - 1];
  return end ? toPointKey(end.x, end.y) : null;
};

export const normalizeRobotPathColors = (paths: RobotPath[]) => {
  const adjacency = paths.map(() => new Set<number>());
  const startIndexMap = new Map<string, number[]>();
  let paletteIndex = 0;

  paths.forEach((path, index) => {
    const startKey = getPathStartKey(path);
    if (!startKey) {
      return;
    }
    const indices = startIndexMap.get(startKey) ?? [];
    indices.push(index);
    startIndexMap.set(startKey, indices);
  });

  paths.forEach((path, index) => {
    const endKey = getPathEndKey(path);
    if (!endKey) {
      return;
    }
    const connected = startIndexMap.get(endKey);
    if (!connected) {
      return;
    }
    connected.forEach((targetIndex) => {
      if (targetIndex === index) {
        return;
      }
      adjacency[index].add(targetIndex);
      adjacency[targetIndex].add(index);
    });
  });

  const visited = new Set<number>();
  paths.forEach((path, index) => {
    if (visited.has(index)) {
      return;
    }

    const color = PATH_COLOR_PALETTE[paletteIndex % PATH_COLOR_PALETTE.length];
    paletteIndex += 1;

    if (path.points.length === 0) {
      path.color = color;
      visited.add(index);
      return;
    }

    const queue = [index];
    visited.add(index);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      paths[current].color = color;
      adjacency[current].forEach((nextIndex) => {
        if (visited.has(nextIndex)) {
          return;
        }
        visited.add(nextIndex);
        queue.push(nextIndex);
      });
    }
  });

  return paths;
};
