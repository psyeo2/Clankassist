import http from "node:http";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { errorHandler, logRequest, notFound } from "./middlewares/index.js";
import { createRouter } from "./routes/index.js";
import { handleListenUpgrade } from "./services/listenSocket.js";
import { mcpClient } from "./services/mcpClient.js";
import { logStartup } from "./utils/logger.js";

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_API_VERSION = "1";

const rawPort = process.env.PORT ?? `${DEFAULT_PORT}`;
const port = Number.parseInt(rawPort, 10);

if (Number.isNaN(port)) {
  throw new Error(`PORT must be a valid number. Received "${rawPort}".`);
}

const apiVersion = (process.env.API_VERSION ?? DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
const apiPrefix = `/api/v${apiVersion}`;

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.use(logRequest);

app.use(apiPrefix, createRouter());
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
server.on("upgrade", (request, socket) => {
  void handleListenUpgrade(request, socket, `${apiPrefix}/listen`).then((handled) => {
    if (!handled) {
      socket.destroy();
    }
  });
});

const closeGracefully = async (): Promise<void> => {
  server.close(async () => {
    await mcpClient.close();
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void closeGracefully();
});

process.on("SIGTERM", () => {
  void closeGracefully();
});

async function main(): Promise<void> {
  await mcpClient.connect();

  server.listen(port, () => {
    logStartup("orchestrator_started", {
      url: `http://localhost:${port}${apiPrefix}`,
      logLevel: process.env.LOG_LEVEL ?? "INFO",
    });
  });
}

main().catch(async (error: unknown) => {
  console.error("Fatal error in orchestrator:", error);
  await mcpClient.close();
  process.exit(1);
});
