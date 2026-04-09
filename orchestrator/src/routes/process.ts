import express from "express";

import { processRequest } from "../controllers/process.js";

const router = express.Router();

router.post("/process", processRequest);

export default router;
