import express from "express";
import { ping } from "../controllers/health.js";

const router = express.Router();

router.get("/ping", ping);

export default router;
