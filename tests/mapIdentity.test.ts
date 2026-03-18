import { describe, expect, it } from "vitest";

import { createMapId, normalizeMapId, resolveMapId } from "@/lib/mapIdentity";

describe("mapIdentity", () => {
  it("normalizes route-safe map ids", () => {
    expect(normalizeMapId("  Demo Map 01  ")).toBe("demo-map-01");
    expect(normalizeMapId("A__B/C")).toBe("a-b-c");
    expect(normalizeMapId("   ")).toBeNull();
  });

  it("creates readable ids from the map name", () => {
    expect(createMapId("Factory Floor")).toMatch(/^factory-floor-/);
  });

  it("falls back to a generated id when the incoming id is missing", () => {
    expect(resolveMapId(undefined, "Demo Map")).toMatch(/^demo-map-/);
  });
});
