import express, { type Router } from "express";
import healthRoutes from "./health.js";

const createApiRouter = (version: number): Router => {
  const router = express.Router();
  const prefix = `/api/v${version}`;

  router.use(prefix, healthRoutes);

  return router;
};

export default createApiRouter;
