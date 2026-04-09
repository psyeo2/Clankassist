export class HttpError extends Error {
  public readonly status: number;
  public readonly data: Record<string, unknown> | null;

  public constructor(
    status: number,
    message: string,
    data: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export const isHttpError = (error: unknown): error is HttpError =>
  error instanceof HttpError;
