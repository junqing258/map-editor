const safeJsonClone = <T>(value: T): T => {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(value, (_key, current) => {
    if (typeof current === "function") {
      return undefined;
    }
    if (typeof current === "object" && current !== null) {
      if (typeof Window !== "undefined" && current instanceof Window) {
        return undefined;
      }
      if (typeof Element !== "undefined" && current instanceof Element) {
        return undefined;
      }
      if (typeof Node !== "undefined" && current instanceof Node) {
        return undefined;
      }
      if (seen.has(current)) {
        return undefined;
      }
      seen.add(current);
    }
    return current;
  });

  if (json === undefined) {
    throw new Error("Failed to clone value");
  }
  return JSON.parse(json) as T;
};

export const safeStructuredClone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return safeJsonClone(value);
  }
};
