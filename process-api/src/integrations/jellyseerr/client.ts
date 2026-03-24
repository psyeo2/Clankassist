import {
  buildUrl,
  normaliseBaseUrl,
  requestJson,
} from "../shared/http";
import type {
  JellyseerrRequestPayload,
  JellyseerrRequestResponse,
  JellyseerrSearchResponse,
} from "./types";

const SERVICE_NAME = "Jellyseerr";

const createHeaders = (apiKey: string): HeadersInit => ({
  "Content-Type": "application/json",
  "X-Api-Key": apiKey,
});

export class JellyseerrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    rawBaseUrl = process.env.JELLYSEERR_API_URL ?? "",
    apiKey = process.env.JELLYSEERR_API_KEY ?? ""
  ) {
    this.baseUrl = normaliseBaseUrl(rawBaseUrl, SERVICE_NAME);
    this.apiKey = apiKey.trim();

    if (this.apiKey === "") {
      throw new Error("JELLYSEERR_API_KEY is not configured.");
    }
  }

  async searchMedia(query: string): Promise<JellyseerrSearchResponse> {
    return requestJson<JellyseerrSearchResponse>(
      SERVICE_NAME,
      buildUrl(this.baseUrl, "/api/v1/search", { query }),
      {
        headers: createHeaders(this.apiKey),
      }
    );
  }

  async requestMedia(
    payload: JellyseerrRequestPayload
  ): Promise<JellyseerrRequestResponse> {
    return requestJson<JellyseerrRequestResponse>(
      SERVICE_NAME,
      buildUrl(this.baseUrl, "/api/v1/request"),
      {
        method: "POST",
        headers: createHeaders(this.apiKey),
        body: JSON.stringify(payload),
      }
    );
  }
}
