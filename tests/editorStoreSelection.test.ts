import { describe, expect, it } from "vitest";

import { createEditorStore } from "@/components/MapEditorCanvas/editorStore";

describe("editorStore batch selection filters", () => {
  it("keeps the boxed source and lets the user toggle selection types on and off", () => {
    const store = createEditorStore();

    store.applyPlatformAt(1, 1);
    store.applyPlatformAt(1, 2);
    store.addPathPoint(1, 1, true);
    store.placeDeviceByTool("supply", 0, 1);

    store.selectElementsInRect(0, 1, 1, 2);

    expect(store.batchSelectionState).not.toBeNull();
    expect(store.batchSelectionState?.availableCounts).toEqual({
      devices: 1,
      cells: 2,
      pathPoints: 1,
    });
    expect(store.selectedElement.kind).toBe("mixed-batch");

    store.setBatchSelectionFilterState({ devices: false });

    expect(store.batchSelectionState?.filter.devices).toBe(false);
    expect(store.selectedElement.kind).toBe("mixed-batch");
    if (store.selectedElement.kind === "mixed-batch") {
      expect(store.selectedElement.deviceIds).toEqual([]);
      expect(store.selectedElement.cells).toHaveLength(2);
      expect(store.selectedElement.pathPoints).toHaveLength(1);
    }

    store.clearBatchSelectionTypes();

    expect(store.selectedElement.kind).toBe("none");
    expect(store.batchSelectionState?.selectedCounts).toEqual({
      devices: 0,
      cells: 0,
      pathPoints: 0,
    });

    store.selectAllBatchSelectionTypes();

    expect(store.selectedElement.kind).toBe("mixed-batch");
    expect(store.batchSelectionState?.selectedCounts).toEqual({
      devices: 1,
      cells: 2,
      pathPoints: 1,
    });

    store.selectByCell(0, 1);

    expect(store.selectedElement.kind).toBe("device");
    expect(store.batchSelectionState).toBeNull();
  });

  it("reuses the last type filter preference for the next marquee selection", () => {
    const store = createEditorStore();

    store.applyPlatformAt(1, 1);
    store.applyPlatformAt(1, 2);
    store.applyPlatformAt(3, 1);
    store.addPathPoint(1, 1, true);
    store.addPathPoint(1, 2);
    store.placeDeviceByTool("supply", 0, 1);
    store.placeDeviceByTool("charger", 2, 1);

    store.selectElementsInRect(0, 1, 1, 2);
    store.setBatchSelectionFilterState({ devices: false, pathPoints: false });

    expect(store.selectedElement.kind).toBe("mixed-batch");
    if (store.selectedElement.kind === "mixed-batch") {
      expect(store.selectedElement.deviceIds).toEqual([]);
      expect(store.selectedElement.cells).toHaveLength(2);
      expect(store.selectedElement.pathPoints).toEqual([]);
    }
    expect(store.batchSelectionState?.filter).toEqual({
      devices: false,
      cells: true,
      pathPoints: false,
    });

    store.selectElementsInRect(2, 1, 3, 1);

    expect(store.batchSelectionState?.filter).toEqual({
      devices: false,
      cells: true,
      pathPoints: false,
    });
    expect(store.batchSelectionState?.availableCounts).toEqual({
      devices: 1,
      cells: 1,
      pathPoints: 0,
    });
    expect(store.selectedElement.kind).toBe("cell");
    if (store.selectedElement.kind === "cell") {
      expect(store.selectedElement.x).toBe(3);
      expect(store.selectedElement.y).toBe(1);
    }

    store.selectAllBatchSelectionTypes();
    store.selectElementsInRect(2, 1, 3, 1);

    expect(store.selectedElement.kind).toBe("mixed-batch");
    expect(store.batchSelectionState?.filter).toEqual({
      devices: true,
      cells: true,
      pathPoints: false,
    });
  });
});
