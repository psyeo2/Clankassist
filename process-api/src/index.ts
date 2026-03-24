import express from "express";
import http from "http";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { errorHandler, logRequest, notFound } from "./middlewares";
import router from "./router";

const DEFAULT_PORT = 3000;
const DEFAULT_API_VERSION = "v1";

const rawPort = process.env.PORT ?? `${DEFAULT_PORT}`;
const port = Number.parseInt(rawPort, 10);

if (Number.isNaN(port)) {
  throw new Error(`PORT must be a valid number. Received "${rawPort}".`);
}

const apiVersion = (process.env.API_VERSION ?? DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
const apiPrefix = `/api/v${apiVersion}`;

const app = express();

app.disable("x-powered-by");
app.use(logRequest);
app.use(
  cors({
    credentials: true,
  })
);

app.use(compression());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(apiPrefix, router());
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}${apiPrefix}`);
});
