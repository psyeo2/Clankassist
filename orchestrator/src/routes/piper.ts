import express from "express";

import { listVoices, synthesise } from "../controllers/piper.js";

const router = express.Router();

router.get("/piper/voices", listVoices);
router.post("/piper/synthesise", synthesise);

export default router;
