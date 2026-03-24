import express from "express";

import health from "./health";
import process from "./process";

export default (): express.Router => {
  const router = express.Router();

  health(router);
  process(router);

  return router;
};
