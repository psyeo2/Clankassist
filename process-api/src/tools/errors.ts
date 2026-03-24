export class ToolValidationError extends Error {
  status: number;

  constructor(message: string) {
    super(message);
    this.name = "ToolValidationError";
    this.status = 400;
  }
}

export class ToolExecutionError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ToolExecutionError";
    this.status = status;
  }
}
