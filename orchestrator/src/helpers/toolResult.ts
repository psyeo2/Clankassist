const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const extractToolText = (result: unknown): string => {
  if (!isRecord(result)) {
    return JSON.stringify(result, null, 2);
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const textParts = content
    .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : null))
    .filter((item): item is string => item !== null && item.trim() !== "");

  if (textParts.length > 0) {
    return textParts.join("\n");
  }

  if (isRecord(result.structuredContent)) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  return JSON.stringify(result, null, 2);
};
