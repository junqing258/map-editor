import { describe, expect, it } from "vitest";

import { createEmptyProject } from "@/types/map";
import { importProjectsFromText, parseProjectFile, parseProjectJsonl, serializeProjectsToJsonl } from "@/utils/projectJsonl";

describe("projectJsonl", () => {
  it("serializes multiple projects into jsonl and parses them back", () => {
    const alpha = createEmptyProject(8, 6, "production", "alpha-map", "alpha-map");
    alpha.meta.tags = ["a"];
    alpha.layers.base[0] = 1;

    const beta = createEmptyProject(10, 4, "simulation", "beta-map", "beta-map");
    beta.meta.tags = ["b"];
    beta.layers.base[3] = 2;

    const jsonl = serializeProjectsToJsonl([alpha, beta]);
    const projects = parseProjectJsonl(jsonl);

    expect(jsonl.trim().split("\n")).toHaveLength(2);
    expect(projects).toHaveLength(2);
    expect(projects[0].meta).toMatchObject({
      id: "alpha-map",
      name: "alpha-map",
      scene: "production",
      tags: ["a"],
    });
    expect(projects[1].meta).toMatchObject({
      id: "beta-map",
      name: "beta-map",
      scene: "simulation",
      tags: ["b"],
    });
    expect(projects[0].layers.base[0]).toBe(1);
    expect(projects[1].layers.base[3]).toBe(2);
  });

  it("falls back to jsonl parsing when the file contains multiple maps", () => {
    const jsonl = [
      JSON.stringify({
        grid: {
          width: 2,
          height: 2,
          nodes: [0, 1, 0, 0],
        },
      }),
      JSON.stringify({
        grid: {
          width: 2,
          height: 2,
          nodes: [1, 0, 0, 0],
        },
      }),
    ].join("\n");

    const projects = parseProjectFile(jsonl);

    expect(projects).toHaveLength(2);
    expect(projects[0].layers.base).toEqual([0, 1, 0, 0]);
    expect(projects[1].layers.base).toEqual([1, 0, 0, 0]);
  });

  it("reports the failing line number for invalid jsonl input", () => {
    expect(() =>
      parseProjectJsonl(
        [
          JSON.stringify({
            grid: {
              width: 2,
              height: 2,
              nodes: [0, 1, 0],
            },
          }),
          JSON.stringify({
            grid: {
              width: 2,
              height: 2,
              nodes: [0, 1, 0, 0],
            },
          }),
        ].join("\n"),
      ),
    ).toThrow("第 1 行导入失败");
  });

  it("collects success and failure counts for mixed jsonl imports", () => {
    const result = importProjectsFromText(
      [
        JSON.stringify({
          grid: {
            width: 2,
            height: 2,
            nodes: [0, 1, 0, 0],
          },
        }),
        JSON.stringify({
          grid: {
            width: 2,
            height: 2,
            nodes: [0, 1, 0],
          },
        }),
        JSON.stringify({
          grid: {
            width: 2,
            height: 2,
            nodes: [1, 0, 0, 0],
          },
        }),
      ].join("\n"),
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.projects).toHaveLength(2);
    expect(result.errors[0]).toContain("第 2 行导入失败");
  });
});
