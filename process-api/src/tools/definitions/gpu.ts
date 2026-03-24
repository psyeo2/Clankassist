import type { ToolDefinition } from "../types";

export const gpuTools: ToolDefinition[] = [
  {
    name: "gpu.get_temp",
    integration: "gpuStatus",
    description: "Get the current GPU temperature in degrees Celsius.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    executionSummary: "Reads the current GPU temperature from the GPU exporter.",
  },
  {
    name: "gpu.get_vram_utilisation",
    integration: "gpuStatus",
    description: "Get the current GPU VRAM utilisation.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    executionSummary: "Reads current GPU memory usage from the GPU exporter.",
  },
  {
    name: "gpu.get_volatile_utilisation",
    integration: "gpuStatus",
    description: "Get the current volatile GPU utilisation.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    executionSummary: "Reads current GPU core utilisation from the GPU exporter.",
  },
];
