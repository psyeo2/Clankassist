import type { ToolDefinition } from "../types";

export const jellyseerrTools: ToolDefinition[] = [
  {
    name: "jellyseerr.request_media",
    integration: "jellyseerr",
    description: "Request a movie or TV show in Jellyseerr.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The movie or TV show title to request.",
        },
        mediaType: {
          type: "string",
          description: "Optional media type hint when the user specifies movie or show.",
          enum: ["movie", "tv"],
        },
        year: {
          type: "integer",
          description: "Optional release year to disambiguate the title.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    executionSummary:
      "Searches Jellyseerr for the requested media, resolves the match, and submits a request if possible.",
  },
];
