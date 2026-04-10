import express, { type Router } from "express";

import adminAuthRoutes from "./adminAuth.js";
import adminCatalogRoutes from "./adminCatalog.js";
import adminDeviceRoutes from "./adminDevices.js";
import healthRoutes from "./health.js";
import piperRoutes from "./piper.js";
import processRoutes from "./process.js";
import respondRoutes from "./respond.js";
import toolsRoutes from "./tools.js";
import whisperRoutes from "./whisper.js";
import { authenticateBearerToken, requireAppSetup } from "../middlewares/index.js";

export const createRouter = (): Router => {
  const router = express.Router();

  router.use(adminAuthRoutes);
  router.use(requireAppSetup);
  router.use(adminCatalogRoutes);
  router.use(adminDeviceRoutes);
  router.use(authenticateBearerToken);
  router.use(healthRoutes);
  router.use(respondRoutes);
  router.use(processRoutes);
  router.use(toolsRoutes);
  router.use(whisperRoutes);
  router.use(piperRoutes);

  return router;
};
