import { describe, expect, it } from "vitest";

import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { normalizeRobotPathColors } from "@/lib/pathColoring";
import type { RobotPath } from "@/types/map";

const createPath = (id: string, points: RobotPath["points"], color = "#000000"): RobotPath => ({
  id,
  name: id,
  color,
  direction: "oneway",
  points,
});

describe("normalizeRobotPathColors", () => {
  it("uses one color for an entire tail-to-head chain", () => {
    const paths = normalizeRobotPathColors([
      createPath("p1", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      createPath("p2", [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
      createPath("p3", [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]),
    ]);

    expect(paths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
    ]);
  });

  it("does not merge head-to-head or tail-to-tail paths into one color group", () => {
    const paths = normalizeRobotPathColors([
      createPath("head-a", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      createPath("head-b", [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ]),
      createPath("tail-a", [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]),
      createPath("tail-b", [
        { x: 2, y: 1 },
        { x: 3, y: 0 },
      ]),
    ]);

    expect(paths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[1],
      PATH_COLOR_PALETTE[2],
      PATH_COLOR_PALETTE[3],
    ]);
  });

  it("assigns colors by first component appearance and handles empty or single-point paths", () => {
    const paths = normalizeRobotPathColors([
      createPath("empty", []),
      createPath("chain-b", [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
      createPath("chain-a", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      createPath("single", [{ x: 8, y: 8 }]),
    ]);

    expect(paths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[1],
      PATH_COLOR_PALETTE[1],
      PATH_COLOR_PALETTE[2],
    ]);
  });
});
