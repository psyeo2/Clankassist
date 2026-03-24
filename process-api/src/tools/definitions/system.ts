import type { ToolDefinition } from "../types";

export const systemTools: ToolDefinition[] = [
  {
    name: "system.unsupported_request",
    integration: "system",
    description:
      "Use this when the user's request does not match any available supported tool or service.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    executionSummary:
      "Marks a request as unsupported so the assistant can decline it cleanly.",
  },
];
