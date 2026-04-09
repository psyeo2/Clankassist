import { HttpError } from "../utils/errors.js";
import { logEvent } from "../utils/logger.js";
import { fetchUpstream, getRequiredBaseUrl, joinUrl, readResponsePreview } from "./http.js";
import { mcpClient } from "./mcpClient.js";

type PlannerTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type PlannerSelection = {
  tool: string;
  args: Record<string, unknown>;
  response: string;
};

type LlmChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  } | string;
};

const plannerResponseSchema = {
  type: "object",
  properties: {
    tool: {
      type: "string",
      description:
        "Exact tool name to execute. Return an empty string if no available tool can fulfil the request.",
    },
    args: {
      type: "object",
      description: "Arguments for the selected tool. Use an empty object when none are required.",
    },
    response: {
      type: "string",
      description:
        "Short natural-language reply for the user. If no tool matches, explain that briefly.",
    },
  },
  required: ["tool", "args", "response"],
  additionalProperties: false,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getLlmBaseUrl = (): string => getRequiredBaseUrl(process.env.LLM_URL, "LLM");

const getLlmModel = (): string => {
  const model = process.env.LLM_MODEL?.trim();
  if (!model) {
    throw new Error("LLM_MODEL is not configured.");
  }

  return model;
};

const getLlmChatCompletionsUrl = (): string => {
  const baseUrl = getLlmBaseUrl();
  return baseUrl.endsWith("/v1")
    ? joinUrl(baseUrl, "/chat/completions")
    : joinUrl(baseUrl, "/v1/chat/completions");
};

const createLlmHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.LLM_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
};

const isPlannerSelection = (value: unknown): value is PlannerSelection => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tool === "string" &&
    typeof value.response === "string" &&
    isRecord(value.args)
  );
};

const createPlanningPrompt = (speech: string, tools: PlannerTool[]): string =>
  [
    "You are a tool planner for a local assistant.",
    "Pick exactly one tool only when the request clearly matches an available tool.",
    'If no tool can fulfil the request, choose "system.unsupported_request" and return an empty object for args.',
    "Do not guess. Do not force unrelated requests into the closest tool.",
    "Do not invent tool names.",
    "Do not invent arguments that are not defined by the selected tool schema.",
    "Keep the response field short and natural.",
    "Use only the exact tool names provided.",
    `Available tools: ${JSON.stringify(tools)}`,
    `User request: ${speech}`,
  ].join("\n");

const getPlannerTools = async (): Promise<PlannerTool[]> => {
  const tools = await mcpClient.listTools();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
};

const parsePlannerContent = (content: string): unknown => {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
      const lines = trimmed.split("\n");
      const fenced = lines.slice(1, -1).join("\n").trim();
      return JSON.parse(fenced);
    }

    throw new HttpError(502, "LLM returned invalid JSON.", {
      service: "llm",
      content,
    });
  }
};

const extractContentText = (payload: LlmChatResponse): string | null => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim();

    return text === "" ? null : text;
  }

  return null;
};

export const planToolSelection = async (speech: string): Promise<PlannerSelection> => {
  const tools = await getPlannerTools();
  const response = await fetchUpstream(
    "llm",
    getLlmChatCompletionsUrl(),
    {
      method: "POST",
      headers: createLlmHeaders(),
      body: JSON.stringify({
        model: getLlmModel(),
        stream: false,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a tool planner for a local assistant. Return exactly one JSON object and no surrounding prose.",
          },
          {
            role: "user",
            content: `${createPlanningPrompt(speech, tools)}\nReturn JSON matching this schema: ${JSON.stringify(
              plannerResponseSchema,
            )}`,
          },
        ],
      }),
    },
    {
      model: getLlmModel(),
      toolCount: tools.length,
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "LLM planning request failed.", {
      service: "llm",
      upstreamStatus: response.status,
      upstreamBody: await readResponsePreview(response),
    });
  }

  const payload = (await response.json()) as LlmChatResponse;
  const content = extractContentText(payload);

  if (!content) {
    throw new HttpError(502, "LLM returned an empty planning response.", {
      service: "llm",
      payload,
    });
  }

  const parsedContent = parsePlannerContent(content);

  if (!isPlannerSelection(parsedContent)) {
    throw new HttpError(502, "LLM returned an invalid planner payload.", {
      service: "llm",
      payload: parsedContent,
    });
  }

  const supportedTools = new Set(tools.map((tool) => tool.name));
  if (
    parsedContent.tool !== "" &&
    parsedContent.tool !== "system.unsupported_request" &&
    !supportedTools.has(parsedContent.tool)
  ) {
    throw new HttpError(502, "LLM selected an unknown tool.", {
      service: "llm",
      tool: parsedContent.tool,
    });
  }

  logEvent("planner_selection", {
    tool: parsedContent.tool,
    args: parsedContent.args,
    response: parsedContent.response,
  });

  return parsedContent;
};
