import type { Response } from "express";

export const handleResponse = <T>(
  response: Response,
  status: number,
  message: string,
  data: T,
): void => {
  response.status(status).json({
    status,
    message,
    data,
  });
};
