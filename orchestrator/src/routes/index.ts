import express, { type Router } from "express";

import healthRoutes from "./health.js";
import piperRoutes from "./piper.js";
import processRoutes from "./process.js";
import toolsRoutes from "./tools.js";
import whisperRoutes from "./whisper.js";

export const createRouter = (): Router => {
  const router = express.Router();

  router.use(healthRoutes);
  router.use(processRoutes);
  router.use(toolsRoutes);
  router.use(whisperRoutes);
  router.use(piperRoutes);

  return router;
};
