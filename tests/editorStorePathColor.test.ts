import { describe, expect, it } from "vitest";

import { createEditorStore } from "@/components/MapEditorCanvas/editorStore";
import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { createEmptyProject } from "@/types/map";

const createProjectWithPlatforms = () => {
  const project = createEmptyProject(6, 2, "production", "path-color-test", "path-color-test");
  project.layers.base = new Array(project.grid.width * project.grid.height).fill(1);
  return project;
};

describe("editorStore path colors", () => {
  it("normalizes loaded connected paths and keeps the shared color while extending the active path", () => {
    const store = createEditorStore();
    const project = createProjectWithPlatforms();
    project.overlays.robotPaths = [
      {
        id: "path-1",
        name: "Path 1",
        color: "#ff0000",
        direction: "oneway",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      {
        id: "path-2",
        name: "Path 2",
        color: "#00ff00",
        direction: "oneway",
        points: [{ x: 1, y: 0 }],
      },
    ];

    store.resetProject(project, { clearHistory: true, skipHistory: true });

    expect(store.project.overlays.robotPaths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
    ]);

    store.activePathId = "path-2";
    store.addPathPoint(2, 0);

    expect(store.project.overlays.robotPaths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
    ]);
  });

  it("re-splits colors after erasing the connection point between two paths", () => {
    const store = createEditorStore();
    const project = createProjectWithPlatforms();
    project.overlays.robotPaths = [
      {
        id: "path-1",
        name: "Path 1",
        color: "#ff0000",
        direction: "oneway",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      {
        id: "path-2",
        name: "Path 2",
        color: "#00ff00",
        direction: "oneway",
        points: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ];

    store.resetProject(project, { clearHistory: true, skipHistory: true });
    store.erasePathPointAt(1, 0);

    expect(store.project.overlays.robotPaths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[1],
    ]);
  });
});
