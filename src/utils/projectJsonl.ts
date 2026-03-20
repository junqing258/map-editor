import type { MapProject } from "@/types/map";
import { projectToStandardMap } from "@/utils/standardMapIO";
import { parseProjectJson } from "./projectIO";

const splitJsonlLines = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const parseProjectJsonl = (raw: string): MapProject[] => {
  const lines = splitJsonlLines(raw);
  if (lines.length === 0) {
    throw new Error("JSONL 文件为空");
  }

  return lines.map((line, index) => {
    try {
      return parseProjectJson(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new Error(`第 ${index + 1} 行导入失败: ${message}`);
    }
  });
};

export interface ProjectImportResult {
  projects: MapProject[];
  successCount: number;
  failureCount: number;
  errors: string[];
}

export const serializeProjectsToJsonl = (projects: MapProject[]) => {
  if (projects.length === 0) {
    throw new Error("没有可导出的地图");
  }

  return projects.map((project) => JSON.stringify(projectToStandardMap(project))).join("\n");
};

export const parseProjectFile = (raw: string): MapProject[] => {
  try {
    return [parseProjectJson(raw)];
  } catch (error) {
    const trimmed = raw.trim();
    if (!trimmed.includes("\n")) {
      throw error;
    }
  }

  return parseProjectJsonl(raw);
};

export const importProjectsFromText = (raw: string): ProjectImportResult => {
  try {
    const project = parseProjectJson(raw);
    return {
      projects: [project],
      successCount: 1,
      failureCount: 0,
      errors: [],
    };
  } catch (error) {
    const trimmed = raw.trim();
    if (!trimmed.includes("\n")) {
      return {
        projects: [],
        successCount: 0,
        failureCount: 1,
        errors: [error instanceof Error ? error.message : "导入失败"],
      };
    }
  }

  const lines = splitJsonlLines(raw);
  if (lines.length === 0) {
    return {
      projects: [],
      successCount: 0,
      failureCount: 1,
      errors: ["JSONL 文件为空"],
    };
  }

  const projects: MapProject[] = [];
  const errors: string[] = [];
  lines.forEach((line, index) => {
    try {
      projects.push(parseProjectJson(line));
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      errors.push(`第 ${index + 1} 行导入失败: ${message}`);
    }
  });

  return {
    projects,
    successCount: projects.length,
    failureCount: errors.length,
    errors,
  };
};
