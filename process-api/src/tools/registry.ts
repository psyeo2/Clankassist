import { gpuTools } from "./definitions/gpu";
import { jellyseerrTools } from "./definitions/jellyseerr";
import { systemTools } from "./definitions/system";
import type { ToolDefinition, ToolSelection } from "./types";

const tools = [...gpuTools, ...jellyseerrTools, ...systemTools];

const toolRegistry = new Map<string, ToolDefinition>(
  tools.map((tool) => [tool.name, tool])
);

export const getToolRegistry = (): ReadonlyMap<string, ToolDefinition> =>
  toolRegistry;

export const listTools = (): ToolDefinition[] => Array.from(toolRegistry.values());

export const getTool = (name: string): ToolDefinition | undefined =>
  toolRegistry.get(name);

export const hasTool = (name: string): boolean => toolRegistry.has(name);

const isConfigured = (envVarName: string): boolean =>
  Boolean(globalThis.process.env[envVarName]?.trim());

export const isToolAvailable = (tool: ToolDefinition): boolean => {
  switch (tool.integration) {
    case "gpuStatus":
      return isConfigured("GPU_EXPORTER_URL");
    case "jellyseerr":
      return (
        isConfigured("JELLYSEERR_API_URL") && isConfigured("JELLYSEERR_API_KEY")
      );
    default:
      return true;
  }
};

export const listAvailableTools = (): ToolDefinition[] =>
  listTools().filter(isToolAvailable);

export const plannerOutputSchema = {
  type: "object",
  properties: {
    tool: {
      type: "string",
      description: "The exact tool name selected from the available tools.",
    },
    args: {
      type: "object",
      description: "Arguments for the selected tool.",
    },
  },
  required: ["tool", "args"],
  additionalProperties: false,
} as const;

export const isToolSelection = (value: unknown): value is ToolSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.tool === "string" &&
    typeof candidate.args === "object" &&
    candidate.args !== null &&
    !Array.isArray(candidate.args)
  );
};
