import express from "express";

import { listTools } from "../controllers/tools.js";

const router = express.Router();

router.get("/tools", listTools);

export default router;
