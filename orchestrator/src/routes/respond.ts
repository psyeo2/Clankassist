import express from "express";

import { respond } from "../controllers/respond.js";

const router = express.Router();

router.post(
  "/respond",
  express.raw({
    type: ["audio/*", "application/octet-stream", "multipart/form-data", "text/plain"],
    limit: "25mb",
  }),
  respond,
);

export default router;
