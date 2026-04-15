import { extractToolText } from "../helpers/toolResult.js";
import { planToolSelection } from "./llm.js";
import { mcpClient } from "./mcpClient.js";
import { transcribeAudio } from "./whisperApi.js";

export type ToolSelection = {
  tool: string;
  args: Record<string, unknown>;
};

export type PlannedSpeechExecution = {
  unsupported: boolean;
  selection: ToolSelection;
  responseText: string;
  result?: unknown;
};

export type DirectToolExecution = {
  selection: ToolSelection;
  responseText: string;
  result: unknown;
};

export type BufferedAudioInput = {
  audioBuffer: Buffer;
  contentType: string;
  filename: string;
};

export const executePlannedSpeech = async (
  speech: string,
): Promise<PlannedSpeechExecution> => {
  const plan = await planToolSelection(speech);
  const selectedTool = plan.tool.trim();
  const responseText =
    plan.response.trim() !== ""
      ? plan.response
      : "I cannot help with that request using the available tools.";

  if (selectedTool === "" || selectedTool === "system.unsupported_request") {
    return {
      unsupported: true,
      selection: {
        tool: "system.unsupported_request",
        args: {},
      },
      responseText,
    };
  }

  const result = await mcpClient.callTool(selectedTool, plan.args);

  return {
    unsupported: false,
    selection: {
      tool: selectedTool,
      args: plan.args,
    },
    responseText: extractToolText(result) || responseText,
    result,
  };
};

export const executeDirectToolSelection = async (
  selection: ToolSelection,
): Promise<DirectToolExecution> => {
  const result = await mcpClient.callTool(selection.tool, selection.args);

  return {
    selection,
    responseText: extractToolText(result),
    result,
  };
};

export const transcribeBufferedAudio = async (
  input: BufferedAudioInput,
): Promise<string> => {
  const transcription = await transcribeAudio(input);
  return transcription.text;
};

export const executeBufferedAudioSpeech = async (
  input: BufferedAudioInput,
): Promise<{ transcript: string; execution: PlannedSpeechExecution }> => {
  const transcript = await transcribeBufferedAudio(input);
  const execution = await executePlannedSpeech(transcript);

  return {
    transcript,
    execution,
  };
};
