import { describe, expect, it } from "vitest";

import { parseProjectJson } from "@/utils/projectIO";

describe("parseProjectJson", () => {
  it("parses legacy and exported fields into the current project shape", () => {
    const raw = JSON.stringify({
      id: "demo-route-id",
      name: "  Demo Map  ",
      scene: "simulation",
      tags: ["alpha", 1, "beta"],
      meterPerCell: 0.8,
      grid: {
        width: 3,
        height: 2,
        chunkSize: 8,
        nodes: [0, 1, 2, 3, 9, -1],
      },
      paths: [
        {
          id: "route-1",
          name: "Inbound",
          color: "#ff0000",
          direction: "bidirectional",
          points: [{ x: 1, y: 1 }],
        },
      ],
      platformPanels: [
        { id: "panel-a", x: 0, y: 0, width: 4, height: 2, spec: "2x4", rotated: false },
        { id: "panel-b", x: 1, y: 1, width: 0, height: 2, spec: "1x2", rotated: true },
      ],
      devices: [
        { type: "queue", x: 0, y: 0 },
        { type: "waiting", x: 1, y: 0 },
        {
          id: "dev-1",
          type: "supply",
          name: "Supply-A",
          x: 2,
          y: 1,
          config: {
            hardwareId: "hw-1",
            speedLimit: 2,
            maxQueue: 6,
            directionDeg: 90,
            supplyMode: "manual",
          },
        },
      ],
    });

    const project = parseProjectJson(raw);

    expect(project.version).toBe("2.0.0");
    expect(project.meta.id).toBe("demo-route-id");
    expect(project.meta.name).toBe("Demo Map");
    expect(project.meta.scene).toBe("simulation");
    expect(project.meta.tags).toEqual(["alpha", "beta"]);
    expect(project.grid).toMatchObject({
      width: 3,
      height: 2,
      chunkSize: 8,
      cellSizeMeter: 0.8,
    });
    expect(project.layers.base).toEqual([2, 3, 2, 3, 0, 0]);
    expect(project.overlays.robotPaths).toEqual([
      {
        id: "route-1",
        name: "Inbound",
        color: "#ff0000",
        direction: "bidirectional",
        points: [{ x: 1, y: 1 }],
      },
    ]);
    expect(project.overlays.platformPanels).toEqual([
      {
        id: "panel-a",
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        spec: "2x4",
        rotated: false,
      },
    ]);
    expect(project.devices).toHaveLength(1);
    expect(project.devices[0]).toMatchObject({
      id: "dev-1",
      type: "supply",
      name: "Supply-A",
      x: 2,
      y: 1,
      config: {
        hardwareId: "hw-1",
        speedLimit: 2,
        maxQueue: 6,
        directionDeg: 90,
        supplyMode: "manual",
        enabled: true,
      },
    });
  });

  it("falls back to default metadata and paths when optional fields are missing", () => {
    const project = parseProjectJson(
      JSON.stringify({
        grid: {
          width: 2,
          height: 2,
          nodes: [0, 1, 0, 0],
        },
      }),
    );

    expect(project.meta.name).toBe("factory-map");
    expect(project.meta.id).toMatch(/^factory-map-/);
    expect(project.meta.scene).toBe("production");
    expect(project.overlays.robotPaths).toHaveLength(1);
    expect(project.overlays.robotPaths[0]).toMatchObject({
      id: "path-main",
      name: "Main Route",
      direction: "oneway",
    });
  });

  it("throws when the base layer length does not match grid dimensions", () => {
    expect(() =>
      parseProjectJson(
        JSON.stringify({
          grid: {
            width: 2,
            height: 2,
            nodes: [0, 1, 0],
          },
        }),
      ),
    ).toThrow("base 图层长度与网格尺寸不一致");
  });
});
