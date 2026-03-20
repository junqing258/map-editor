import { describe, expect, it } from "vitest";

import { PATH_COLOR_PALETTE } from "@/lib/mapPalette";
import { parseProjectJson } from "@/utils/projectIO";
import { projectToStandardMap } from "@/utils/standardMapIO";

const createMark = (
  code: string,
  x: number,
  y: number,
  tag: string | null,
  extra: { label?: string; mark?: number | null } = {},
) => ({
  code,
  type: "mr",
  bb: null,
  z: 0,
  x: x + 0.5,
  y: 4 - y - 0.5,
  heading: [],
  lock: false,
  location: {
    label: extra.label,
    mark: extra.mark ?? null,
    tag,
    facing: [],
    capacity: null,
  },
  trafficRule: null,
  attr: {
    dockable: true,
    rotatable: true,
    loadSpeed: null,
    unloadSpeed: null,
    loadAcceleration: null,
    unloadAcceleration: null,
  },
});

describe("standardMapIO", () => {
  it("parses MapInterface payloads and maps equipment modes into the editor model", () => {
    const raw = JSON.stringify({
      id: "scene-001",
      meta: {},
      info: {
        name: "Standard Scene",
        key: "scene-key",
        layer: 2,
        width: 5,
        height: 4,
        blocks: 8,
        max_value: 9,
        resolution: 1,
        simulation: true,
        interval: 1000,
        original: { x: 0, y: 4 },
        create_date: "2026-03-18T08:00:00.000Z",
        modify_date: "2026-03-19T08:00:00.000Z",
        last_modify_user: "tester",
        groups: ["alpha", "beta"],
      },
      basic: [{ id: "basic-1" }],
      advanced: [{ id: "advanced-1" }],
      marks: [
        createMark("load-node", 1, 2, "loadPort"),
        createMark("auto-node", 2, 2, "autoPort"),
        createMark("lift-node", 3, 2, "liftPort"),
        createMark("unload-node", 1, 1, "unloadPort"),
        createMark("sorter-node", 2, 1, "sorterPort"),
        createMark("charger-node", 3, 1, "chargerPort"),
        createMark("queue-node", 0, 0, "queuePort"),
        createMark("wait-node", 4, 3, "waitPort"),
      ],
      areas: [{ id: "area-1", areaType: 1, directionLimit: "NoConstraint", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, label: "A", capacity: null }],
      paths: [
        { code: "auto-node-e", start: "auto-node", end: "lift-node", lock: false },
        { code: "lift-node-w", start: "lift-node", end: "auto-node", lock: true },
      ],
      arcs: [{ id: "arc-1" }],
      traffic: [{ id: "traffic-1" }],
      devices: [{ id: "device-1" }],
      infos: [{ id: "info-1" }],
      loadEquipments: [
        { id: "load-1", name: "Load-1", x: 0, y: 2, aboutBlock: "load-node", direction: "W" },
      ],
      autoEquipments: [
        { id: "auto-1", name: "Auto-1", x: 2, y: 3, aboutBlock: ["auto-node", "lift-node"], direction: "S" },
      ],
      hoistEquipments: [
        { id: "hoist-1", name: "Hoist-1", x: 4, y: 2, aboutBlock: "lift-node", direction: "E" },
      ],
      unloadEquipments: [
        { id: "unload-1", name: "Unload-1", x: 0, y: 1, aboutBlock: "unload-node", direction: "W" },
      ],
      sorterEquipments: [
        { id: "sorter-1", name: "Sorter-1", x: 2, y: 0, aboutBlock: "sorter-node", direction: "N", left: true },
      ],
      chargerEquipments: [
        { id: "charger-1", name: "Charger-1", x: 4, y: 1, aboutBlock: "charger-node", direction: "E" },
      ],
    });

    const project = parseProjectJson(raw);

    expect(project.meta.id).toBe("scene-001");
    expect(project.meta.name).toBe("Standard Scene");
    expect(project.meta.scene).toBe("simulation");
    expect(project.meta.tags).toEqual(["alpha", "beta"]);
    expect(project.grid).toMatchObject({
      width: 5,
      height: 4,
      cellSizeMeter: 1,
    });
    expect(project.layers.base[2 * 5 + 1]).toBe(1);
    expect(project.layers.base[0]).toBe(2);
    expect(project.layers.base[3 * 5 + 4]).toBe(3);
    expect(project.overlays.robotPaths).toEqual([
      {
        id: "auto-node-e",
        name: "auto-node-e",
        color: expect.any(String),
        direction: "bidirectional",
        points: [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
      },
    ]);
    expect(project.devices).toHaveLength(6);
    expect(project.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "load-1",
          type: "supply",
          config: expect.objectContaining({
            supplyMode: "manual",
            boundCells: [{ x: 1, y: 2 }],
          }),
        }),
        expect.objectContaining({
          id: "auto-1",
          type: "supply",
          config: expect.objectContaining({
            supplyMode: "auto",
            boundCells: [
              { x: 2, y: 2 },
              { x: 3, y: 2 },
            ],
          }),
        }),
        expect.objectContaining({
          id: "hoist-1",
          type: "supply",
          config: expect.objectContaining({
            supplyMode: "elevator",
          }),
        }),
        expect.objectContaining({
          id: "unload-1",
          type: "unload",
          config: expect.objectContaining({
            unloadMode: "normal",
          }),
        }),
        expect.objectContaining({
          id: "sorter-1",
          type: "unload",
          config: expect.objectContaining({
            unloadMode: "multi-sort",
            left: true,
          }),
        }),
        expect.objectContaining({
          id: "charger-1",
          type: "charger",
        }),
      ]),
    );
    expect(project.protocol.info).toMatchObject({
      key: "scene-key",
      layer: 2,
      maxValue: 9,
      lastModifyUser: "tester",
      original: { x: 0, y: 4 },
      interval: 1000,
      resolution: 1,
      blockSize: 1,
    });
    expect(project.protocol.collections.basic).toEqual([{ id: "basic-1" }]);
    expect(project.protocol.marks["2,2"].code).toBe("auto-node");
    expect(project.protocol.pathEdges["2,2>3,2"]).toEqual({
      code: "auto-node-e",
      lock: false,
    });
    expect(project.protocol.pathEdges["3,2>2,2"]).toEqual({
      code: "lift-node-w",
      lock: true,
    });
  });

  it("exports the editor project back into MapInterface while preserving codes and multi-binding equipment", () => {
    const project = parseProjectJson(
      JSON.stringify({
        id: "scene-001",
        meta: {},
        info: {
          name: "Standard Scene",
          key: "scene-key",
          layer: 2,
          width: 5,
          height: 4,
          blocks: 8,
          max_value: 9,
          resolution: 1,
          simulation: false,
          interval: 1000,
          original: { x: 0, y: 4 },
          create_date: "2026-03-18T08:00:00.000Z",
          modify_date: "2026-03-19T08:00:00.000Z",
          last_modify_user: "tester",
          groups: ["alpha"],
        },
        basic: [],
        advanced: [],
        marks: [
          createMark("load-node", 1, 2, "loadPort"),
          createMark("auto-node", 2, 2, "autoPort"),
          createMark("lift-node", 3, 2, "liftPort"),
          createMark("unload-node", 1, 1, "unloadPort"),
          createMark("sorter-node", 2, 1, "sorterPort"),
          createMark("charger-node", 3, 1, "chargerPort"),
          createMark("queue-node", 0, 0, "queuePort"),
          createMark("wait-node", 4, 3, "waitPort"),
        ],
        areas: [],
        paths: [
          { code: "auto-node-e", start: "auto-node", end: "lift-node", lock: false },
          { code: "lift-node-w", start: "lift-node", end: "auto-node", lock: true },
        ],
        arcs: [],
        traffic: [],
        devices: [],
        infos: [],
        loadEquipments: [
          { id: "load-1", name: "Load-1", x: 0, y: 2, aboutBlock: "load-node", direction: "W" },
        ],
        autoEquipments: [
          { id: "auto-1", name: "Auto-1", x: 2, y: 3, aboutBlock: ["auto-node", "lift-node"], direction: "S" },
        ],
        hoistEquipments: [
          { id: "hoist-1", name: "Hoist-1", x: 4, y: 2, aboutBlock: "lift-node", direction: "E" },
        ],
        unloadEquipments: [
          { id: "unload-1", name: "Unload-1", x: 0, y: 1, aboutBlock: "unload-node", direction: "W" },
        ],
        sorterEquipments: [
          { id: "sorter-1", name: "Sorter-1", x: 2, y: 0, aboutBlock: "sorter-node", direction: "N", left: true },
        ],
        chargerEquipments: [
          { id: "charger-1", name: "Charger-1", x: 4, y: 1, aboutBlock: "charger-node", direction: "E" },
        ],
      }),
    );

    const exported = projectToStandardMap(project);

    expect(exported.id).toBe("scene-001");
    expect(exported.info).toMatchObject({
      name: "Standard Scene",
      key: "scene-key",
      layer: 2,
      width: 5,
      height: 4,
      resolution: 1,
      interval: 1000,
      blocks: 8,
      simulation: false,
      groups: ["alpha"],
    });
    expect(exported.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "queue-node",
          location: expect.objectContaining({ tag: "queuePort" }),
        }),
        expect.objectContaining({
          code: "wait-node",
          location: expect.objectContaining({ tag: "waitPort" }),
        }),
      ]),
    );
    expect(exported.paths).toEqual(
      expect.arrayContaining([
        { code: "auto-node-e", start: "auto-node", end: "lift-node", lock: false },
        { code: "lift-node-w", start: "lift-node", end: "auto-node", lock: true },
      ]),
    );
    expect(exported.loadEquipments).toEqual([
      expect.objectContaining({
        id: "load-1",
        aboutBlock: "load-node",
        direction: "W",
      }),
    ]);
    expect(exported.autoEquipments).toEqual([
      expect.objectContaining({
        id: "auto-1",
        aboutBlock: ["auto-node", "lift-node"],
        direction: "S",
      }),
    ]);
    expect(exported.hoistEquipments).toEqual([
      expect.objectContaining({
        id: "hoist-1",
        aboutBlock: "lift-node",
        direction: "E",
      }),
    ]);
    expect(exported.unloadEquipments).toEqual([
      expect.objectContaining({
        id: "unload-1",
        aboutBlock: "unload-node",
        direction: "W",
      }),
    ]);
    expect(exported.sorterEquipments).toEqual([
      expect.objectContaining({
        id: "sorter-1",
        aboutBlock: "sorter-node",
        direction: "N",
        left: true,
      }),
    ]);
    expect(exported.chargerEquipments).toEqual([
      expect.objectContaining({
        id: "charger-1",
        aboutBlock: "charger-node",
        direction: "E",
      }),
    ]);
  });

  it("groups imported standard-map paths by tail-to-head connectivity", () => {
    const raw = JSON.stringify({
      id: "scene-chain",
      meta: {},
      info: {
        name: "Chain Scene",
        key: "scene-chain-key",
        layer: 1,
        width: 4,
        height: 1,
        blocks: 4,
        max_value: 1,
        resolution: 1,
        simulation: false,
        interval: 1000,
        original: { x: 0, y: 1 },
        create_date: "2026-03-18T08:00:00.000Z",
        modify_date: "2026-03-19T08:00:00.000Z",
        last_modify_user: "tester",
        groups: [],
      },
      basic: [],
      advanced: [],
      marks: [
        createMark("node-a", 0, 0, null),
        createMark("node-b", 1, 0, null),
        createMark("node-c", 2, 0, null),
        createMark("node-d", 3, 0, null),
      ],
      areas: [{ id: "area-1", areaType: 1, directionLimit: "NoConstraint", bounds: { minX: 0, minY: 0, maxX: 3, maxY: 0 }, label: "A", capacity: null }],
      paths: [
        { code: "ab", start: "node-a", end: "node-b", lock: false },
        { code: "bc", start: "node-b", end: "node-c", lock: false },
        { code: "cd", start: "node-c", end: "node-d", lock: false },
      ],
      arcs: [],
      traffic: [],
      devices: [],
      infos: [],
      loadEquipments: [],
      autoEquipments: [],
      hoistEquipments: [],
      unloadEquipments: [],
      sorterEquipments: [],
      chargerEquipments: [],
    });

    const project = parseProjectJson(raw);

    expect(project.overlays.robotPaths).toHaveLength(3);
    expect(project.overlays.robotPaths.map((path) => path.color)).toEqual([
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
      PATH_COLOR_PALETTE[0],
    ]);
  });
});
