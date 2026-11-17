import { Router } from "express";
import { z } from "zod";
import { getAuth, requireAdmin, requireEvaluateAuth } from "../auth.js";
import type { EvaluateClient } from "../evaluateClient.js";
import { PayrollError } from "./store.js";
import { PayrollService } from "./service.js";
const selection = z
  .object({
    storeId: z.string().min(1),
    periodId: z.string().min(1).optional(),
    publicationId: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (s) => Number(Boolean(s.periodId)) + Number(Boolean(s.publicationId)) === 1,
    "请选择一个周期或发布版本",
  );
const key = z.string().min(1).max(150),
  uuid = z.uuid();
export function createPayrollRouter(
  evaluate: EvaluateClient,
  service: PayrollService,
) {
  const router = Router();
  router.use(requireEvaluateAuth(evaluate));
  router.use((req, _res, next) => {
    try {
      requireAdmin(getAuth(req));
      next();
    } catch (e) {
      next(e);
    }
  });
  router.use((q, _r, next) => {
    if (
      !["GET", "HEAD"].includes(q.method) &&
      service.client.config.XERO_REDIRECT_URI &&
      q.header("origin") !==
        new URL(service.client.config.XERO_REDIRECT_URI).origin
    )
      return next(new PayrollError(403, "Request origin is not trusted"));
    next();
  });
  const locked = (fn: () => Promise<any>) =>
    service.store.lock("xero-operation", fn);
  router.get("/status", async (_q, r) => r.json(await service.status()));
  router.post("/connect", async (q, r) =>
    r.json(
      await locked(() =>
        service.connect(getAuth(q).accountId, q.header("cookie") ?? ""),
      ),
    ),
  );
  router.get("/oauth/callback", async (q, r) => {
    try {
      const input = z
        .object({
          state: z.string().min(1),
          code: z.string().optional(),
          error: z.string().optional(),
        })
        .parse(q.query);
      await locked(() =>
        service.callback(getAuth(q).accountId, q.header("cookie") ?? "", input),
      );
      r.status(302).setHeader("location", "/export?xero=connected").send("");
    } catch {
      r.status(302).setHeader("location", "/export?xero=error").send("");
    }
  });
  router.post("/tenant", async (q, r) => {
    const v = z
      .object({ tenantId: uuid, expectedTenantId: uuid.nullable() })
      .strict()
      .parse(q.body);
    r.json(
      await locked(() =>
        service.select(getAuth(q).accountId, v.tenantId, v.expectedTenantId),
      ),
    );
  });
  router.post("/disconnect", async (q, r) =>
    r.json(await locked(() => service.disconnect(getAuth(q).accountId))),
  );
  router.get("/references", async (_q, r) =>
    r.json(await locked(() => service.references())),
  );
  router.post("/references/refresh", async (_q, r) =>
    r.json(await locked(() => service.references(true))),
  );
  router.get("/mappings", async (_q, r) => r.json(await service.mappings()));
  router.put("/mappings", async (q, r) => {
    const v = z
      .object({
        tenantId: uuid,
        version: z.number().int().nonnegative(),
        employees: z.record(
          key,
          z.object({ xeroEmployeeId: uuid, status: z.literal("Matched") }),
        ),
        rates: z.record(key, uuid),
        tracking: z.record(key, uuid),
      })
      .strict()
      .parse(q.body);
    r.json(await locked(() => service.saveMappings(getAuth(q).accountId, v)));
  });
  router.post("/previews", async (q, r) => {
    const v = z
      .object({ selections: z.array(selection).min(1).max(20) })
      .strict()
      .parse(q.body);
    r.status(201).json(
      await locked(() => service.preview(getAuth(q).accountId, v.selections)),
    );
  });
  router.get("/previews/:id", async (q, r) =>
    r.json(await service.getPreview(q.params.id)),
  );
  router.get("/previews/:id/revisions", async (q, r) =>
    r.json(await service.revisions(q.params.id)),
  );
  router.get("/previews/:id/revisions/:version", async (q, r) =>
    r.json(
      await service.revisions(
        q.params.id,
        z.coerce.number().int().positive().parse(q.params.version),
      ),
    ),
  );
  router.put("/previews/:id", async (q, r) => {
    const v = z
      .object({
        version: z.number().int().positive(),
        rows: z
          .array(
            z
              .object({
                id: key,
                paidMinutes: z.number().int().min(0).max(1440),
                unpaidBreakMinutes: z.number().int().min(0).max(1440),
                category: z.string().min(1).max(100),
                confirmed: z.boolean(),
                reason: z.string().trim().min(3).max(500),
                breakAllocationConfirmed: z.boolean().optional(),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict()
      .parse(q.body);
    r.json(
      await locked(() =>
        service.savePreview(getAuth(q).accountId, q.params.id, v),
      ),
    );
  });
  router.post("/previews/:id/validate", async (q, r) => {
    const v = z
      .object({ mappingVersion: z.number().int().nonnegative() })
      .strict()
      .parse(q.body);
    r.json(
      await locked(() => service.validate(q.params.id, true, v.mappingVersion)),
    );
  });
  router.post("/previews/:id/confirm", async (q, r) => {
    const v = z
      .object({
        version: z.number().int().positive(),
        adoptExistingDraft: z.boolean(),
        mappingVersion: z.number().int().nonnegative(),
      })
      .strict()
      .parse(q.body);
    r.json(
      await locked(() =>
        service.confirm(
          getAuth(q).accountId,
          q.params.id,
          v.version,
          v.adoptExistingDraft,
          v.mappingVersion,
        ),
      ),
    );
  });
  router.post("/previews/:id/sync", async (q, r) =>
    r.json(
      await locked(() => service.start(getAuth(q).accountId, q.params.id)),
    ),
  );
  router.post("/jobs/:id/retry", async (q, r) =>
    r.json(
      await locked(() => service.retry(getAuth(q).accountId, q.params.id)),
    ),
  );
  router.get("/targets", async (_q, r) => r.json(await service.targets()));
  router.post("/targets/:id/reconcile", async (q, r) => {
    const v = z
      .object({
        version: z.number().int().positive(),
        timesheetId: uuid,
        confirmed: z.literal(true),
      })
      .strict()
      .parse(q.body);
    r.json(
      await locked(() =>
        service.reconcileTarget(
          getAuth(q).accountId,
          q.params.id,
          v.version,
          v.timesheetId,
        ),
      ),
    );
  });
  router.get("/jobs", async (_q, r) => r.json(await service.history()));
  router.get("/jobs/:id", async (q, r) =>
    r.json(await service.job(q.params.id)),
  );
  router.post("/jobs/:id/process", async (q, r) => {
    const v = z
      .object({ retryFailed: z.boolean().default(false) })
      .strict()
      .parse(q.body ?? {});
    r.json(
      await locked(() =>
        service.process(getAuth(q).accountId, q.params.id, v.retryFailed),
      ),
    );
  });
  return router;
}
