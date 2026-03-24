import {
  buildUrl,
  normaliseBaseUrl,
  requestText,
} from "../shared/http";

export interface MetricSample {
  labels: Record<string, string>;
  value: number;
}

export interface MetricReading {
  metricName: string;
  samples: MetricSample[];
}

const SERVICE_NAME = "GPU exporter";

const parseLabels = (rawLabels: string | undefined): Record<string, string> => {
  if (!rawLabels) {
    return {};
  }

  return rawLabels.split(",").reduce<Record<string, string>>((labels, part) => {
    const [key, rawValue] = part.split("=");

    if (!key || rawValue === undefined) {
      return labels;
    }

    labels[key.trim()] = rawValue.trim().replace(/^"|"$/g, "");
    return labels;
  }, {});
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseMetricSamples = (metricsText: string, metricName: string): MetricSample[] => {
  const regex = new RegExp(
    `^${escapeRegex(metricName)}(?:\\{([^}]*)\\})?\\s+([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)$`,
    "gm"
  );

  const samples: MetricSample[] = [];

  let match = regex.exec(metricsText);

  while (match !== null) {
    samples.push({
      labels: parseLabels(match[1]),
      value: Number.parseFloat(match[2]),
    });

    match = regex.exec(metricsText);
  }

  return samples;
};

export class GpuStatusClient {
  private readonly baseUrl: string;

  constructor(rawBaseUrl = process.env.GPU_EXPORTER_URL ?? "") {
    this.baseUrl = normaliseBaseUrl(rawBaseUrl, SERVICE_NAME);
  }

  private async getMetricsText(): Promise<string> {
    return requestText(SERVICE_NAME, buildUrl(this.baseUrl, "/metrics"));
  }

  async getMetric(metricName: string): Promise<MetricReading> {
    const metrics = await this.getMetrics([metricName]);
    return metrics[metricName];
  }

  async getMetrics(metricNames: string[]): Promise<Record<string, MetricReading>> {
    const metricsText = await this.getMetricsText();
    const readings: Record<string, MetricReading> = {};

    for (const metricName of metricNames) {
      const samples = parseMetricSamples(metricsText, metricName);

      if (samples.length === 0) {
        throw new Error(
          `Metric "${metricName}" was not found in the GPU exporter output.`
        );
      }

      readings[metricName] = {
        metricName,
        samples,
      };
    }

    return readings;
  }
}
