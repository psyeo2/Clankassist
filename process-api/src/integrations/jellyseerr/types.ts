export type JellyseerrMediaType = "movie" | "tv";

export interface JellyseerrSearchResult {
  id: number;
  mediaType: JellyseerrMediaType | string;
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  mediaInfo?: {
    status?: number;
  };
}

export interface JellyseerrSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: JellyseerrSearchResult[];
}

export interface JellyseerrRequestPayload {
  mediaType: JellyseerrMediaType;
  mediaId: number;
  tmdbId: number;
  tvdbId?: number;
  seasons?: "all" | number[];
  userId?: number;
}

export interface JellyseerrRequestResponse {
  id: number;
  status?: number;
  media?: {
    id?: number;
    tmdbId?: number;
    mediaType?: JellyseerrMediaType | string;
  };
}
