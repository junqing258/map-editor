import { afterEach, describe, expect, it, vi } from "vitest";

import { safeStructuredClone } from "@/utils/safeClone";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeStructuredClone", () => {
  it("uses structuredClone when available", () => {
    const source = {
      nested: {
        value: 1,
      },
    };

    const cloned = safeStructuredClone(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.nested).not.toBe(source.nested);
  });

  it("falls back to a safe JSON clone when structuredClone fails", () => {
    vi.stubGlobal("structuredClone", () => {
      throw new Error("unsupported");
    });

    const source: Record<string, unknown> = {
      name: "demo",
      nested: {
        count: 2,
      },
      skip: () => "ignore",
    };
    source.self = source;

    const cloned = safeStructuredClone(source) as Record<string, unknown>;

    expect(cloned).toEqual({
      name: "demo",
      nested: {
        count: 2,
      },
    });
  });
});
