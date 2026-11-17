import {createPayrollRouter} from './payroll/routes.js';
import {PayrollStore,pgSql} from './payroll/store.js';
import {XeroClient} from './payroll/xero.js';
import {PayrollService} from './payroll/service.js';
import {payrollSources} from './payroll/sources.js';
import {RosterService} from './rosterService.js';
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { EvaluateClient } from "./evaluateClient.js";
import { HttpError } from "./httpError.js";
import { SchedulingError } from "./schedulingIssue.js";
import { prisma } from "./prisma.js";
import { createRouter } from "./routes.js";
import { describeErrorForLog } from "./safeLogging.js";
import { createEmployeeDemoRouter } from "./employeeDemoRoutes.js";

export function createApp(options: { production?: boolean; evaluate?: EvaluateClient; databaseHealth?: () => Promise<unknown>; frontendDistPath?: string } = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const evaluate = options.evaluate ?? new EvaluateClient();
  const databaseHealth = options.databaseHealth ?? (() => prisma.$queryRawUnsafe("SELECT 1"));
  const frontendDistPath = resolve(options.frontendDistPath ?? join(process.cwd(), "..", "dist"));
  const appOrigin = normalizeOrigin(process.env.APP_ORIGIN ?? renderOrigin());
  if (production && !appOrigin) throw new Error("APP_ORIGIN is required in production.");
  if (production && !existsSync(join(frontendDistPath, "index.html"))) throw new Error("Frontend production build not found.");

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
    crossOriginResourcePolicy: false,
  }));
  if (!production) app.use(cors({ origin: readOrigins(), credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store, private");
    next();
  });

  app.get("/api/health", async (_request, response) => {
    let database = false;
    let evaluateMolly = false;
    try { await databaseHealth(); database = true; } catch (error) { console.error("Database health failed", describeErrorForLog(error)); }
    try { evaluateMolly = await evaluate.health(); } catch { evaluateMolly = false; }
    const ok = database && evaluateMolly;
    response.status(ok ? 200 : 503).json({ ok, services: { database, evaluateMolly } });
  });

  app.use((request, response, next) => {
    if (!production || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
    if (normalizeOrigin(request.header("origin")) !== appOrigin) return response.status(403).json({ message: "请求来源不受信任" });
    next();
  });
  if (!production) app.use("/api/employee-demo", createEmployeeDemoRouter());
  const payrollStore=new PayrollStore(pgSql(prisma));
  app.use("/api/payroll", createPayrollRouter(evaluate,new PayrollService(payrollStore,new XeroClient(payrollStore,process.env),payrollSources(new RosterService(prisma)))));
  app.use("/api", createRouter(evaluate));
  app.use("/api", (_request, response) => response.status(404).json({ message: "API endpoint not found." }));

  if (production) {
    app.use("/assets", express.static(join(frontendDistPath, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(frontendDistPath, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || !request.accepts("html") || extname(request.path)) return next();
      response.setHeader("cache-control", "no-cache");
      response.sendFile(join(frontendDistPath, "index.html"), (error) => error ? next(error) : undefined);
    });
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next;
    const status = error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 500;
    if (status >= 500) console.error("Request failed", describeErrorForLog(error));
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "请求内容不正确" : error instanceof HttpError ? error.message : "服务器暂时无法处理请求";
    response.status(status).json({ message, ...(error instanceof SchedulingError ? { validation: error.validation } : {}) });
  };
  app.use(errorHandler);
  return app;
}

function readOrigins() {
  return (process.env.CORS_ORIGIN ?? "http://127.0.0.1:5176,http://localhost:5176").split(",").map(normalizeOrigin).filter((value): value is string => Boolean(value));
}
function normalizeOrigin(value: string | undefined) { if (!value) return undefined; try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined; } catch { return undefined; } }
function renderOrigin() { const host = process.env.RENDER_EXTERNAL_HOSTNAME?.trim(); return host ? `https://${host}` : undefined; }
