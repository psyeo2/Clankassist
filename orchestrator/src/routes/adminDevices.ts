import express from "express";

import {
  createManagedDevice,
  getManagedDevice,
  issueManagedDeviceToken,
  listDevices,
} from "../controllers/adminDevices.js";
import { authenticateAdminSession } from "../middlewares/index.js";

const router = express.Router();

router.use(authenticateAdminSession);

router.get("/admin/devices", listDevices);
router.post("/admin/devices", createManagedDevice);
router.get("/admin/devices/:id", getManagedDevice);
router.post("/admin/devices/:id/tokens", issueManagedDeviceToken);

export default router;
