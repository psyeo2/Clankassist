import express from "express";

import {
  createToken,
  deleteToken,
  getAllTokens,
  getToken,
  revokeToken,
  updateToken,
} from "../controllers/authTokens.js";
import { isAdmin } from "../middlewares/index.js";

const router = express.Router();

router.get("/auth/tokens", isAdmin, getAllTokens);
router.get("/auth/tokens/:id", isAdmin, getToken);
router.post("/auth/tokens", isAdmin, createToken);
router.patch("/auth/tokens/:id", isAdmin, updateToken);
router.delete("/auth/tokens/:id", isAdmin, deleteToken);
router.post("/auth/tokens/:id/revoke", isAdmin, revokeToken);

export default router;
