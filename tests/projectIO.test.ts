import { describe, expect, it } from "vitest";

import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { parseProjectJson } from "@/utils/projectIO";

import sampleModelRaw from "./data/model_20260226075225.json?raw";

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
        color: PATH_COLOR_PALETTE[0],
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

  it("recomputes imported path colors by tail-to-head connectivity", () => {
    const project = parseProjectJson(
      JSON.stringify({
        grid: {
          width: 4,
          height: 1,
          nodes: [1, 1, 1, 1],
        },
        paths: [
          {
            id: "route-1",
            name: "Route 1",
            color: "#ff0000",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
          },
          {
            id: "route-2",
            name: "Route 2",
            color: "#00ff00",
            points: [
              { x: 1, y: 0 },
              { x: 2, y: 0 },
            ],
          },
          {
            id: "route-3",
            name: "Route 3",
            color: "#0000ff",
            points: [
              { x: 3, y: 0 },
              { x: 3, y: 0 },
            ],
          },
        ],
      }),
    );

    expect(project.overlays.robotPaths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[1],
    ]);
  });

  it("parses the real MapInterface sample from tests/data/model_20260226075225.json", () => {
    const project = parseProjectJson(sampleModelRaw);

    expect(project.meta).toMatchObject({
      id: "sfyabhc4",
      name: "分拣机二层",
      scene: "simulation",
      tags: ["分组一"],
    });
    expect(project.grid).toMatchObject({
      width: 36,
      height: 15,
      cellSizeMeter: 0.55,
    });
    expect(project.layers.base.filter((cell) => cell > 0)).toHaveLength(242);
    expect(project.devices).toHaveLength(18);
    expect(project.devices.filter((device) => device.type === "supply")).toHaveLength(4);
    expect(project.devices.filter((device) => device.type === "unload")).toHaveLength(8);
    expect(project.devices.filter((device) => device.type === "charger")).toHaveLength(6);
    expect(project.protocol.info).toMatchObject({
      key: "bfaf94b3c5c3ee3f6ca1b1a8af75f07768faa00b",
      layer: 1,
      maxValue: 1,
      lastModifyUser: "admin",
      original: { x: 50000, y: 50000 },
      resolution: 0.013750000000000002,
      interval: 550,
      blockSize: 40,
    });
    expect(Object.keys(project.protocol.pathEdges)).toHaveLength(299);
    expect(project.protocol.marks["31,0"]).toMatchObject({
      code: "Rw0NyMb9",
      location: {
        tag: "loadPort",
      },
    });
    expect(project.protocol.marks["34,9"]).toMatchObject({
      code: "zAEhcH8e",
      location: {
        tag: "chargerPort",
      },
    });
    expect(project.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "Ky6_3ITh",
          type: "supply",
          config: expect.objectContaining({
            supplyMode: "manual",
            boundCells: [{ x: 31, y: 0 }],
          }),
        }),
        expect.objectContaining({
          id: "6x2eueSu",
          type: "unload",
          config: expect.objectContaining({
            unloadMode: "multi-sort",
            left: true,
            right: true,
            boundCells: [{ x: 18, y: 9 }],
          }),
        }),
        expect.objectContaining({
          id: "4xj23Gd6",
          type: "charger",
          config: expect.objectContaining({
            boundCells: [{ x: 34, y: 9 }],
          }),
        }),
      ]),
    );
  });
});
