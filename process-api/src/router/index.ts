import express from "express";

import health from "./health";

export default (): express.Router => {
  const router = express.Router();

  health(router);

  return router;
};
