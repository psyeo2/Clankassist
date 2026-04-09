import express, { type Router } from "express";

import authTokenRoutes from "./authTokens.js";
import healthRoutes from "./health.js";
import piperRoutes from "./piper.js";
import processRoutes from "./process.js";
import respondRoutes from "./respond.js";
import toolsRoutes from "./tools.js";
import whisperRoutes from "./whisper.js";
import { authenticateBearerToken } from "../middlewares/index.js";

export const createRouter = (): Router => {
  const router = express.Router();

  router.use(authTokenRoutes);
  router.use(authenticateBearerToken);
  router.use(healthRoutes);
  router.use(respondRoutes);
  router.use(processRoutes);
  router.use(toolsRoutes);
  router.use(whisperRoutes);
  router.use(piperRoutes);

  return router;
};
