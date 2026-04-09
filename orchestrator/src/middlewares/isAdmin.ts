import type { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";

import { HttpError } from "../utils/errors.js";

dotenv.config();

export const isAdmin = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD must be set in .env");
    }

    const adminHeader = request.headers["x-admin-key"];
    if (typeof adminHeader !== "string" || adminHeader.trim() === "") {
      throw new HttpError(401, "Unauthorised: Missing admin header");
    }

    if (adminHeader !== adminPassword) {
      throw new HttpError(401, "Unauthorised: Admin key incorrect");
    }

    next();
  } catch (error) {
    next(error);
  }
};
