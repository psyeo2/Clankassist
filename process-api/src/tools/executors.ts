import { GpuStatusClient } from "../integrations/gpuStatus/client";
import { JellyseerrClient } from "../integrations/jellyseerr/client";
import type {
  JellyseerrMediaType,
  JellyseerrRequestPayload,
  JellyseerrSearchResult,
} from "../integrations/jellyseerr/types";
import { getTool } from "./registry";
import { ToolExecutionError } from "./errors";
import { validateToolSelection } from "./validation";
import type { ToolDefinition, ToolSelection } from "./types";

export interface ToolExecutionResult {
  tool: string;
  integration: string;
  result: Record<string, unknown>;
  speech: string;
}

type ToolExecutor = (
  selection: ToolSelection,
  tool: ToolDefinition
) => Promise<ToolExecutionResult>;

const round = (value: number, digits = 1): number =>
  Number(value.toFixed(digits));

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const getMetricName = (envVarName: string, defaultMetricName: string): string =>
  process.env[envVarName]?.trim() || defaultMetricName;

const createGpuMetricExecutor = (
  envVarName: string,
  defaultMetricName: string,
  metricLabel: string,
  speechUnit: string
): ToolExecutor => {
  return async (selection, tool) => {
    const metricName = getMetricName(envVarName, defaultMetricName);
    const client = new GpuStatusClient();
    const reading = await client.getMetric(metricName);
    const values = reading.samples.map((sample) => sample.value);
    const sampleCount = values.length;
    const aggregateValue = round(average(values));
    const spokenValue =
      speechUnit === "degrees Celsius" ? round(aggregateValue, 0) : aggregateValue;

    const speech =
      sampleCount === 1
        ? `Your GPU ${metricLabel} is ${spokenValue} ${speechUnit}.`
        : `Average GPU ${metricLabel} is ${spokenValue} ${speechUnit} across ${sampleCount} GPUs.`;

    return {
      tool: selection.tool,
      integration: tool.integration,
      result: {
        metricName: reading.metricName,
        sampleCount,
        samples: reading.samples,
        value: aggregateValue,
        unit: speechUnit,
      },
      speech,
    };
  };
};

const buildSampleKey = (labels: Record<string, string>): string =>
  Object.entries(labels)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");

const createGpuVramUtilisationExecutor = (): ToolExecutor => {
  return async (selection, tool) => {
    const usedMetricName = getMetricName(
      "GPU_VRAM_USED_METRIC",
      "DCGM_FI_DEV_FB_USED"
    );
    const freeMetricName = getMetricName(
      "GPU_VRAM_FREE_METRIC",
      "DCGM_FI_DEV_FB_FREE"
    );
    const client = new GpuStatusClient();
    const readings = await client.getMetrics([usedMetricName, freeMetricName]);
    const usedReading = readings[usedMetricName];
    const freeSamplesByKey = new Map(
      readings[freeMetricName].samples.map((sample) => [
        buildSampleKey(sample.labels),
        sample,
      ])
    );

    const samples = usedReading.samples.map((usedSample) => {
      const sampleKey = buildSampleKey(usedSample.labels);
      const freeSample = freeSamplesByKey.get(sampleKey);

      if (!freeSample) {
        throw new ToolExecutionError(
          `No matching free-memory sample was found for GPU labels "${sampleKey}".`,
          502
        );
      }

      const usedMb = usedSample.value;
      const freeMb = freeSample.value;
      const totalMb = usedMb + freeMb;
      const utilisationPercent =
        totalMb > 0 ? round((usedMb / totalMb) * 100) : 0;

      return {
        labels: usedSample.labels,
        usedMb: round(usedMb),
        freeMb: round(freeMb),
        totalMb: round(totalMb),
        utilisationPercent,
      };
    });

    const sampleCount = samples.length;
    const aggregateValue = round(
      average(samples.map((sample) => sample.utilisationPercent))
    );
    const speech =
      sampleCount === 1
        ? `Your GPU VRAM utilisation is ${aggregateValue} percent.`
        : `Average GPU VRAM utilisation is ${aggregateValue} percent across ${sampleCount} GPUs.`;

    return {
      tool: selection.tool,
      integration: tool.integration,
      result: {
        usedMetricName,
        freeMetricName,
        sampleCount,
        samples,
        value: aggregateValue,
        unit: "percent",
      },
      speech,
    };
  };
};

const normaliseTitle = (value: string): string =>
  value.trim().toLocaleLowerCase();

const getResultTitle = (result: JellyseerrSearchResult): string =>
  result.title ?? result.name ?? "Unknown title";

const getResultYear = (result: JellyseerrSearchResult): number | null => {
  const dateValue = result.releaseDate ?? result.firstAirDate;

  if (!dateValue) {
    return null;
  }

  const year = Number.parseInt(dateValue.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
};

const scoreJellyseerrMatch = (
  result: JellyseerrSearchResult,
  title: string,
  mediaType?: JellyseerrMediaType,
  year?: number
): number => {
  let score = 0;
  const normalisedRequestedTitle = normaliseTitle(title);
  const normalisedResultTitle = normaliseTitle(getResultTitle(result));

  if (mediaType && result.mediaType === mediaType) {
    score += 4;
  }

  if (normalisedRequestedTitle === normalisedResultTitle) {
    score += 5;
  } else if (normalisedResultTitle.includes(normalisedRequestedTitle)) {
    score += 2;
  }

  if (year !== undefined && getResultYear(result) === year) {
    score += 3;
  }

  return score;
};

const pickBestJellyseerrMatch = (
  results: JellyseerrSearchResult[],
  title: string,
  mediaType?: JellyseerrMediaType,
  year?: number
): JellyseerrSearchResult | null => {
  const candidates = results.filter(
    (result) =>
      (result.mediaType === "movie" || result.mediaType === "tv") &&
      (mediaType === undefined || result.mediaType === mediaType)
  );

  if (candidates.length === 0) {
    return null;
  }

  const rankedCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreJellyseerrMatch(candidate, title, mediaType, year),
    }))
    .sort((left, right) => right.score - left.score);

  return rankedCandidates[0]?.candidate ?? null;
};

const parseOptionalUserId = (): number | undefined => {
  const rawUserId = process.env.JELLYSEERR_REQUEST_USER_ID?.trim();

  if (!rawUserId) {
    return undefined;
  }

  const userId = Number.parseInt(rawUserId, 10);

  if (Number.isNaN(userId)) {
    throw new ToolExecutionError(
      'JELLYSEERR_REQUEST_USER_ID must be a valid integer when provided.',
      500
    );
  }

  return userId;
};

const executeJellyseerrRequest: ToolExecutor = async (selection, tool) => {
  const title = selection.args.title;
  const rawMediaType = selection.args.mediaType;
  const rawYear = selection.args.year;

  if (typeof title !== "string" || title.trim() === "") {
    throw new ToolExecutionError('Argument "title" must be a non-empty string.', 400);
  }

  if (
    rawMediaType !== undefined &&
    rawMediaType !== "movie" &&
    rawMediaType !== "tv"
  ) {
    throw new ToolExecutionError(
      'Argument "mediaType" must be "movie" or "tv".',
      400
    );
  }

  if (
    rawYear !== undefined &&
    (typeof rawYear !== "number" || !Number.isInteger(rawYear) || rawYear < 1800)
  ) {
    throw new ToolExecutionError(
      'Argument "year" must be a realistic integer year.',
      400
    );
  }

  const mediaType = rawMediaType as JellyseerrMediaType | undefined;
  const year = rawYear as number | undefined;

  const client = new JellyseerrClient();
  const searchResponse = await client.searchMedia(title.trim());
  const matchedResult = pickBestJellyseerrMatch(
    searchResponse.results,
    title,
    mediaType,
    year
  );

  if (!matchedResult) {
    throw new ToolExecutionError(
      `No matching Jellyseerr media item was found for "${title}".`,
      404
    );
  }

  const requestPayload: JellyseerrRequestPayload = {
    mediaType: matchedResult.mediaType as JellyseerrMediaType,
    mediaId: matchedResult.id,
    tmdbId: matchedResult.id,
  };

  if (requestPayload.mediaType === "tv") {
    requestPayload.seasons = "all";
  }

  const userId = parseOptionalUserId();

  if (userId !== undefined) {
    requestPayload.userId = userId;
  }

  const requestResponse = await client.requestMedia(requestPayload);
  const resolvedTitle = getResultTitle(matchedResult);
  const resolvedYear = getResultYear(matchedResult);
  const yearSuffix = resolvedYear ? ` (${resolvedYear})` : "";

  return {
    tool: selection.tool,
    integration: tool.integration,
    result: {
      request: requestResponse,
      matchedMedia: {
        id: matchedResult.id,
        mediaType: matchedResult.mediaType,
        title: resolvedTitle,
        year: resolvedYear,
      },
      payload: requestPayload,
    },
    speech: `Requested ${resolvedTitle}${yearSuffix} in Jellyseerr.`,
  };
};

const executorRegistry = new Map<string, ToolExecutor>([
  [
    "gpu.get_temp",
    createGpuMetricExecutor(
      "GPU_TEMPERATURE_METRIC",
      "DCGM_FI_DEV_GPU_TEMP",
      "temperature",
      "degrees Celsius"
    ),
  ],
  [
    "gpu.get_vram_utilisation",
    createGpuVramUtilisationExecutor(),
  ],
  [
    "gpu.get_volatile_utilisation",
    createGpuMetricExecutor(
      "GPU_VOLATILE_UTILISATION_METRIC",
      "DCGM_FI_DEV_GPU_UTIL",
      "utilisation",
      "percent"
    ),
  ],
  ["jellyseerr.request_media", executeJellyseerrRequest],
]);

export const listExecutableTools = (): string[] =>
  Array.from(executorRegistry.keys());

export const executeToolSelection = async (
  selection: ToolSelection
): Promise<ToolExecutionResult> => {
  validateToolSelection(selection);

  const tool = getTool(selection.tool);

  if (!tool) {
    throw new ToolExecutionError(`Unknown tool "${selection.tool}".`, 400);
  }

  const executor = executorRegistry.get(selection.tool);

  if (!executor) {
    throw new ToolExecutionError(
      `No executor is registered for tool "${selection.tool}".`,
      501
    );
  }

  return executor(selection, tool);
};
