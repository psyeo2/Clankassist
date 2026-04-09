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

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
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

const getOllamaBaseUrl = (): string => getRequiredBaseUrl(process.env.OLLAMA_URL, "OLLAMA");

const getOllamaModel = (): string => {
  const model = process.env.OLLAMA_MODEL?.trim();
  if (!model) {
    throw new Error("OLLAMA_MODEL is not configured.");
  }

  return model;
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

    throw new HttpError(502, "oLLaMa returned invalid JSON.", {
      service: "ollama",
      content,
    });
  }
};

export const planToolSelection = async (speech: string): Promise<PlannerSelection> => {
  const tools = await getPlannerTools();
  const response = await fetchUpstream(
    "ollama",
    joinUrl(getOllamaBaseUrl(), "/api/chat"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOllamaModel(),
        stream: false,
        format: plannerResponseSchema,
        options: {
          temperature: 0,
        },
        messages: [
          {
            role: "user",
            content: createPlanningPrompt(speech, tools),
          },
        ],
      }),
    },
    {
      model: getOllamaModel(),
      toolCount: tools.length,
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "oLLaMa planning request failed.", {
      service: "ollama",
      upstreamStatus: response.status,
      upstreamBody: await readResponsePreview(response),
    });
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const content = payload.message?.content;

  if (!content) {
    throw new HttpError(502, "oLLaMa returned an empty planning response.", {
      service: "ollama",
    });
  }

  const parsedContent = parsePlannerContent(content);

  if (!isPlannerSelection(parsedContent)) {
    throw new HttpError(502, "oLLaMa returned an invalid planner payload.", {
      service: "ollama",
      payload: parsedContent,
    });
  }

  const supportedTools = new Set(tools.map((tool) => tool.name));
  if (
    parsedContent.tool !== "" &&
    parsedContent.tool !== "system.unsupported_request" &&
    !supportedTools.has(parsedContent.tool)
  ) {
    throw new HttpError(502, "oLLaMa selected an unknown tool.", {
      service: "ollama",
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
