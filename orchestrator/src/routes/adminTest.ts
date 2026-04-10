import express from "express";

import { respond } from "../controllers/respond.js";
import { authenticateAdminSession } from "../middlewares/index.js";

const router = express.Router();

router.use(authenticateAdminSession);

router.post(
  "/admin/test/respond",
  express.raw({
    type: ["audio/*", "application/octet-stream", "multipart/form-data", "text/plain"],
    limit: "25mb",
  }),
  respond,
);

export default router;
