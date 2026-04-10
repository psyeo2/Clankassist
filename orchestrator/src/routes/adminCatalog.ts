import express from "express";

import {
  createResource,
  createResourceVersion,
  createTool,
  createToolVersion,
  listResources,
  listResourceVersions,
  listTools,
  listToolVersions,
  publishResourceVersion,
  publishToolVersion,
} from "../controllers/adminCatalog.js";
import { authenticateAdminSession } from "../middlewares/index.js";

const router = express.Router();

router.use(authenticateAdminSession);

router.get("/admin/tools", listTools);
router.post("/admin/tools", createTool);
router.get("/admin/tools/:toolId/versions", listToolVersions);
router.post("/admin/tools/:toolId/versions", createToolVersion);
router.post("/admin/tools/:toolId/publish", publishToolVersion);
router.get("/admin/resources", listResources);
router.post("/admin/resources", createResource);
router.get("/admin/resources/:resourceId/versions", listResourceVersions);
router.post("/admin/resources/:resourceId/versions", createResourceVersion);
router.post("/admin/resources/:resourceId/publish", publishResourceVersion);

export default router;
