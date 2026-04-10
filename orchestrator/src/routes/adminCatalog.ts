import express from "express";

import {
  createIntegration,
  createResource,
  createResourceVersion,
  createTool,
  createToolVersion,
  publishResourceVersion,
  publishToolVersion,
} from "../controllers/adminCatalog.js";
import { authenticateAdminSession } from "../middlewares/index.js";

const router = express.Router();

router.use(authenticateAdminSession);

router.post("/admin/integrations", createIntegration);
router.post("/admin/tools", createTool);
router.post("/admin/tools/:toolId/versions", createToolVersion);
router.post("/admin/tools/:toolId/publish", publishToolVersion);
router.post("/admin/resources", createResource);
router.post("/admin/resources/:resourceId/versions", createResourceVersion);
router.post("/admin/resources/:resourceId/publish", publishResourceVersion);

export default router;
