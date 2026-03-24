import express from "express";

import { ping } from "../controllers/health";

export default (router: express.Router) => {
  router.get("/ping", ping);
};
