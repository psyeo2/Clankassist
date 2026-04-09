import { z, type ZodTypeAny } from "zod";

type JsonSchema = Record<string, unknown>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const applyCommonShapeRules = (
  schema: ZodTypeAny,
  definition: JsonSchema,
): ZodTypeAny => {
  let current = schema;

  if (typeof definition.description === "string") {
    current = current.describe(definition.description);
  }

  if (definition.nullable === true) {
    current = current.nullable();
  }

  return current;
};

const convertDefinitionToZod = (definition: JsonSchema): ZodTypeAny => {
  const type = definition.type;

  if (Array.isArray(definition.enum) && definition.enum.every((item) => typeof item === "string")) {
    const values = definition.enum as string[];
    if (values.length > 0) {
      return applyCommonShapeRules(z.enum([values[0], ...values.slice(1)]), definition);
    }
  }

  if (type === "string") {
    let schema = z.string();

    if (typeof definition.minLength === "number") {
      schema = schema.min(definition.minLength);
    }

    if (typeof definition.maxLength === "number") {
      schema = schema.max(definition.maxLength);
    }

    return applyCommonShapeRules(schema, definition);
  }

  if (type === "integer") {
    let schema = z.number().int();

    if (typeof definition.minimum === "number") {
      schema = schema.min(definition.minimum);
    }

    if (typeof definition.maximum === "number") {
      schema = schema.max(definition.maximum);
    }

    return applyCommonShapeRules(schema, definition);
  }

  if (type === "number") {
    let schema = z.number();

    if (typeof definition.minimum === "number") {
      schema = schema.min(definition.minimum);
    }

    if (typeof definition.maximum === "number") {
      schema = schema.max(definition.maximum);
    }

    return applyCommonShapeRules(schema, definition);
  }

  if (type === "boolean") {
    return applyCommonShapeRules(z.boolean(), definition);
  }

  if (type === "array") {
    const itemDefinition = asRecord(definition.items);
    const itemSchema =
      Object.keys(itemDefinition).length > 0 ? convertDefinitionToZod(itemDefinition) : z.unknown();
    let schema = z.array(itemSchema);

    if (typeof definition.minItems === "number") {
      schema = schema.min(definition.minItems);
    }

    if (typeof definition.maxItems === "number") {
      schema = schema.max(definition.maxItems);
    }

    return applyCommonShapeRules(schema, definition);
  }

  if (type === "object") {
    const shape = jsonSchemaToZodShape(definition);
    const additionalProperties = definition.additionalProperties;
    const objectSchema =
      additionalProperties === false
        ? z.object(shape).strict()
        : z.object(shape).passthrough();

    return applyCommonShapeRules(objectSchema, definition);
  }

  return applyCommonShapeRules(z.unknown(), definition);
};

export const jsonSchemaToZodShape = (schema: JsonSchema): Record<string, ZodTypeAny> => {
  const properties = asRecord(schema.properties);
  const required = Array.isArray(schema.required)
    ? new Set(schema.required.filter((item): item is string => typeof item === "string"))
    : new Set<string>();
  const shape: Record<string, ZodTypeAny> = {};

  for (const [propertyName, propertyDefinition] of Object.entries(properties)) {
    const definition = asRecord(propertyDefinition);
    let propertySchema = convertDefinitionToZod(definition);

    if (!required.has(propertyName)) {
      propertySchema = propertySchema.optional();
    }

    shape[propertyName] = propertySchema;
  }

  return shape;
};
