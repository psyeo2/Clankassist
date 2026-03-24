import { getTool } from "./registry";
import { ToolValidationError } from "./errors";
import type {
  ToolDefinition,
  ToolParameterDefinition,
  ToolSelection,
} from "./types";

const isValueOfType = (
  definition: ToolParameterDefinition,
  value: unknown
): boolean => {
  switch (definition.type) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    default:
      return false;
  }
};

const validateArgsForTool = (
  tool: ToolDefinition,
  args: Record<string, unknown>
): void => {
  const { properties, required = [], additionalProperties = true } = tool.parameters;

  for (const propertyName of required) {
    if (!(propertyName in args)) {
      throw new ToolValidationError(
        `Missing required argument "${propertyName}" for tool "${tool.name}".`
      );
    }
  }

  if (!additionalProperties) {
    for (const propertyName of Object.keys(args)) {
      if (!(propertyName in properties)) {
        throw new ToolValidationError(
          `Unexpected argument "${propertyName}" for tool "${tool.name}".`
        );
      }
    }
  }

  for (const [propertyName, value] of Object.entries(args)) {
    const definition = properties[propertyName];

    if (!definition) {
      continue;
    }

    if (!isValueOfType(definition, value)) {
      throw new ToolValidationError(
        `Argument "${propertyName}" must be of type ${definition.type} for tool "${tool.name}".`
      );
    }

    if (
      definition.enum &&
      typeof value === "string" &&
      !definition.enum.includes(value)
    ) {
      throw new ToolValidationError(
        `Argument "${propertyName}" must be one of: ${definition.enum.join(", ")}.`
      );
    }
  }
};

export const validateToolSelection = (selection: ToolSelection): ToolDefinition => {
  const tool = getTool(selection.tool);

  if (!tool) {
    throw new ToolValidationError(`Unknown tool "${selection.tool}".`);
  }

  validateArgsForTool(tool, selection.args);
  return tool;
};
