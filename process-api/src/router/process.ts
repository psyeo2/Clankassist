import express from "express";

import { process } from "../controllers/process";

export default (router: express.Router) => {
  router.post("/process", process);
};
