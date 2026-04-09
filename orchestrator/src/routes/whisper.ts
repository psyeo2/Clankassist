import express from "express";

import { transcribe } from "../controllers/whisper.js";

const router = express.Router();

router.post(
  "/whisper/transcribe",
  express.raw({
    type: ["audio/*", "application/octet-stream"],
    limit: "25mb",
  }),
  transcribe,
);

export default router;
