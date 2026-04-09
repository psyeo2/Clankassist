import express from "express";

import { ping } from "./controllers/health.js";
import { processRequest } from "./controllers/process.js";
import { listTools } from "./controllers/tools.js";

export const createRouter = (): express.Router => {
  const router = express.Router();

  router.get("/ping", ping);
  router.get("/tools", listTools);
  router.post("/process", processRequest);

  return router;
};
