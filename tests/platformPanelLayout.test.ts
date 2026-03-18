import { describe, expect, it } from "vitest";

import { arePanelsEqual, buildPlatformPanelLayout } from "@/lib/platformPanelLayout";

describe("buildPlatformPanelLayout", () => {
  it("prefers a single 2x4 panel when the full footprint is available", () => {
    const layout = buildPlatformPanelLayout(new Array(8).fill(1), 4, 2);

    expect(layout).toEqual([
      {
        id: "panel-1",
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        spec: "2x4",
        rotated: false,
      },
    ]);
  });

  it("builds 1x2 domino panels for leftover adjacent cells", () => {
    const layout = buildPlatformPanelLayout([1, 1, 0, 0], 2, 2);

    expect(layout).toEqual([
      {
        id: "panel-1",
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        spec: "1x2",
        rotated: false,
      },
    ]);
  });
});

describe("arePanelsEqual", () => {
  it("compares layouts by ordered panel properties", () => {
    const left = buildPlatformPanelLayout(new Array(8).fill(1), 4, 2);
    const right = [
      {
        id: "another-id",
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        spec: "2x4" as const,
        rotated: false,
      },
    ];
    const mismatch = [
      {
        id: "panel-1",
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        spec: "1x2" as const,
        rotated: false,
      },
    ];

    expect(arePanelsEqual(left, right)).toBe(true);
    expect(arePanelsEqual(left, mismatch)).toBe(false);
  });
});
