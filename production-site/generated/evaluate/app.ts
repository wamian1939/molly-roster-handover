import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { prisma } from "./prisma.js";
import { router } from "./routes.js";
import { describeErrorForLog } from "./safeLogging.js";

type AppOptions = {
  production?: boolean;
  frontendDistPath?: string;
  appOrigin?: string;
  developmentOrigins?: string[];
  healthCheck?: () => Promise<unknown>;
};

export function createApp(options: AppOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const appOrigin = normalizeOrigin(options.appOrigin ?? process.env.APP_ORIGIN ?? renderOrigin());
  const developmentOrigins = options.developmentOrigins ?? readDevelopmentOrigins();
  const frontendDistPath = resolve(options.frontendDistPath ?? "dist");
  const healthCheck = options.healthCheck ?? (() => prisma.$queryRawUnsafe("SELECT 1"));

  if (production && !appOrigin) {
    throw new Error("APP_ORIGIN is required in production and must be an absolute http(s) origin.");
  }
  if (production && !existsSync(join(frontendDistPath, "index.html"))) {
    throw new Error(`Frontend production build not found at ${frontendDistPath}.`);
  }

  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: production ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    } : false,
    crossOriginResourcePolicy: production ? { policy: "same-origin" } : false,
  }));
  if (!production) app.use(cors({ origin: developmentOrigins, credentials: true }));
  app.use(express.json());
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store, private");
    next();
  });
  app.get("/api/health", async (_request, response) => {
    try {
      await healthCheck();
      response.json({ ok: true });
    } catch (error) {
      console.error("Health check failed", describeErrorForLog(error));
      response.status(503).json({ ok: false });
    }
  });
  app.use((request, response, next) => {
    if (!production || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      next();
      return;
    }
    if (normalizeOrigin(request.header("origin")) !== appOrigin) {
      response.status(403).json({ message: "请求来源不受信任" });
      return;
    }
    next();
  });

  app.use("/api", router);
  app.use("/api", (_request, response) => response.status(404).json({ message: "API endpoint not found." }));

  if (production) {
    app.use("/assets", express.static(join(frontendDistPath, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(frontendDistPath, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || !request.accepts("html") || extname(request.path)) {
        next();
        return;
      }
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(join(frontendDistPath, "index.html"), (error) => error ? next(error) : undefined);
    });
  }

  return app;
}

function readDevelopmentOrigins() {
  return (process.env.CORS_ORIGIN ?? "http://127.0.0.1:5174,http://localhost:5174")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function renderOrigin() {
  const hostname = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
  return hostname ? `https://${hostname}` : undefined;
}
