export type ToolPropertyType = "string" | "number" | "integer" | "boolean";

export interface ToolParameterDefinition {
  type: ToolPropertyType;
  description: string;
  enum?: readonly string[];
}

export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, ToolParameterDefinition>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  integration: string;
  description: string;
  parameters: ToolParametersSchema;
  executionSummary: string;
}

export interface ToolSelection {
  tool: string;
  args: Record<string, unknown>;
}
