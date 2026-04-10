import express from "express";

import {
  getSetupStatus,
  loginAdmin,
  logoutAdmin,
  refreshAdminSession,
  revokeAllAdminSessions,
  setupAdminPassword,
} from "../controllers/adminAuth.js";
import { authenticateAdminSession } from "../middlewares/index.js";

const router = express.Router();

router.get("/admin/setup/status", getSetupStatus);
router.post("/admin/setup", setupAdminPassword);
router.post("/admin/login", loginAdmin);
router.post("/admin/refresh", refreshAdminSession);
router.post("/admin/logout", authenticateAdminSession, logoutAdmin);
router.post("/admin/logout-all", authenticateAdminSession, revokeAllAdminSessions);

export default router;
