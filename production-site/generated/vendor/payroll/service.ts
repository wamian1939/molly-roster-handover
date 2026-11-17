import { removedRows } from "./reconciliation.js";
import { PayrollError, PayrollStore } from "./store.js";
import { XeroClient, scopes } from "./xero.js";
import { digest, seal } from "./crypto.js";
import { prepareShifts, buildTargets } from "./preparation.js";
import { canonicalSheet, remoteTarget, syncGroup } from "./sync.js";
export type SourceLoader = (selections: any[]) => Promise<any[]>;
export class PayrollService {
  constructor(
    readonly store: PayrollStore,
    readonly client: XeroClient,
    readonly loadSources: SourceLoader,
  ) {}
  async status() {
    const c = await this.store.get("connection");
    return {
      configured: this.client.configured(),
      connected: Boolean(
        c?.tenantId && c?.encrypted && !c.reauthorizationRequired,
      ),
      tenantId: c?.tenantId ?? null,
      organizationName: c?.organizationName ?? null,
      lastConnectionTime: c?.connectedAt ?? null,
      lastSuccessfulSync: c?.lastSuccessfulSync ?? null,
      reauthorizationRequired: Boolean(c?.reauthorizationRequired),
      organizations: c?.tenants ?? [],
      automaticSync: {
        enabled: false,
        available: false,
        reason: "当前无可靠后台调度；仅同步管理员确认并锁定的工资预览",
      },
    };
  }
  async connect(actor: string, cookie: string) {
    this.client.requireConfig();
    const state = crypto.randomUUID() + crypto.randomUUID();
    await this.store.put("oauth:" + (await digest(state)), "oauth", {
      actor,
      sessionHash: await digest(cookie),
      expiresAt: Date.now() + 600000,
      used: false,
    });
    const url = new URL("https://login.xero.com/identity/connect/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.client.config.XERO_CLIENT_ID!,
      redirect_uri: this.client.config.XERO_REDIRECT_URI!,
      scope:
        scopes +
        (this.client.config.XERO_ENABLE_TRACKING === "1"
          ? " accounting.settings.read"
          : ""),
      state,
    }).toString();
    return { url: url.toString() };
  }
  async callback(actor: string, cookie: string, query: any) {
    const id = "oauth:" + (await digest(query.state)),
      state = await this.store.get(id);
    if (
      !state ||
      state.used ||
      state.expiresAt < Date.now() ||
      state.actor !== actor ||
      state.sessionHash !== (await digest(cookie))
    )
      throw new PayrollError(400, "OAuth state 无效、已使用或与登录会话不一致");
    state.used = true;
    await this.store.put(id, "oauth", state);
    if (query.error) throw new PayrollError(400, "Xero 授权未完成，请重新连接");
    const tokens = await this.client.exchange({
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: this.client.config.XERO_REDIRECT_URI!,
    });
    const old = await this.store.get("connection");
    let c: any = {
      ...old,
      tenantId: null,
      organizationName: null,
      selectionRevision: crypto.randomUUID(),
      tenants: [],
      encrypted: await seal(
        tokens,
        this.client.config.XERO_TOKEN_KEY!,
        "xero:connection",
      ),
      connectedAt: new Date().toISOString(),
      reauthorizationRequired: false,
    };
    await this.store.put("connection", "connection", c);
    const result = await this.client.request("/connections");
    c = await this.store.get("connection"); // A request may rotate tokens/version.
    c.tenants = result.data
      .filter((t: any) => t.tenantType === "ORGANISATION")
      .map((t: any) => ({
        id: t.id,
        tenantId: t.tenantId,
        tenantName: t.tenantName,
      }));
    await this.store.put("connection", "connection", c);
    await this.store.audit(actor, "XERO_AUTHORIZED", {});
    return this.status();
  }
  async select(
    actor: string,
    tenantId: string,
    expectedTenantId: string | null,
  ) {
    let c = await this.store.get("connection");
    if (!c?.encrypted) throw new PayrollError(409, "请先连接 Xero");
    if ((c.tenantId ?? null) !== expectedTenantId)
      throw new PayrollError(409, "组织选择已变化，请刷新");
    const { data } = await this.client.request("/connections");
    const tenant = data.find(
      (t: any) => t.tenantId === tenantId && t.tenantType === "ORGANISATION",
    );
    if (!tenant) throw new PayrollError(403, "未授权访问该 Xero Organization");
    c = await this.store.get("connection");
    c.tenantId = tenantId;
    c.organizationName = tenant.tenantName;
    c.lastSuccessfulSync =
      (await this.store.get("tenant-meta:" + tenantId))?.lastSuccessfulSync ??
      null;
    c.selectionRevision = crypto.randomUUID();
    await this.store.put("connection", "connection", c);
    await this.store.audit(actor, "XERO_TENANT_SELECTED", { tenantId });
    return this.status();
  }
  async connection(expected?: string) {
    const c = await this.store.get("connection");
    if (!c?.tenantId || c.reauthorizationRequired)
      throw new PayrollError(409, "请选择已连接的 Xero Organization");
    if (expected && c.tenantId !== expected)
      throw new PayrollError(409, "目标 Organization 已变化，请重新预览");
    return c;
  }
  async disconnect(actor: string) {
    let c = await this.store.get("connection");
    if (c?.encrypted) {
      const { data } = await this.client.request("/connections");
      for (const tenant of data)
        await this.client.request(
          "/connections/" + encodeURIComponent(tenant.id),
          { method: "DELETE" },
        );
    }
    c = await this.store.get("connection");
    if (c) {
      c.encrypted = null;
      c.tenantId = null;
      c.tenants = [];
      c.organizationName = null;
      c.selectionRevision = crypto.randomUUID();
      await this.store.put("connection", "connection", c);
    }
    await this.store.audit(actor, "XERO_DISCONNECTED", {});
    return this.status();
  }
  async references(refresh = false) {
    const c = await this.connection(),
      id = "refs:" + c.tenantId;
    let r = await this.store.get(id);
    if (refresh || !r) {
      r = {
        ...r,
        ...(await this.client.references(c.tenantId)),
        tenantId: c.tenantId,
      };
      await this.store.put(id, "refs", r);
    }
    return r;
  }
  async mappings() {
    const c = await this.connection();
    return (
      (await this.store.get("maps:" + c.tenantId)) ?? {
        tenantId: c.tenantId,
        employees: {},
        rates: {},
        tracking: {},
        _version: 0,
      }
    );
  }
  async saveMappings(actor: string, input: any) {
    const c = await this.connection(input.tenantId),
      refs = await this.references(),
      maps = await this.mappings();
    if (input.version !== maps._version)
      throw new PayrollError(409, "映射已变化，请刷新");
    const used = new Set();
    for (const [employeeId, m] of Object.entries(input.employees) as [
      string,
      any,
    ][]) {
      if (
        m.status !== "Matched" ||
        !refs.employees.some((e: any) => e.EmployeeID === m.xeroEmployeeId)
      )
        throw new PayrollError(
          400,
          "员工映射必须人工确认且使用真实 Xero Employee ID",
        );
      if (used.has(m.xeroEmployeeId))
        throw new PayrollError(
          400,
          "两个 Roster 员工不能映射到同一个 Xero 员工",
        );
      used.add(m.xeroEmployeeId);
      if (!employeeId.trim())
        throw new PayrollError(400, "Roster Employee ID 不能为空");
    }
    for (const id of Object.values(input.rates))
      if (!refs.rates.some((r: any) => r.EarningsRateID === id))
        throw new PayrollError(400, "Earnings Rate 必须来自当前组织");
    for (const id of Object.values(input.tracking))
      if (!refs.tracking.some((t: any) => t.TrackingItemID === id))
        throw new PayrollError(
          400,
          "Tracking Item 必须来自当前组织的 Timesheet Category",
        );
    await this.store.audit(actor, "XERO_MAPPINGS_CHANGED", {
      tenantId: c.tenantId,
      before: maps,
      after: input,
    });
    Object.assign(maps, {
      employees: input.employees,
      rates: input.rates,
      tracking: input.tracking,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    });
    await this.store.put("maps:" + c.tenantId, "maps", maps);
    return maps;
  }
  async preview(actor: string, selections: any[]) {
    const c = await this.connection(),
      sources = await this.loadSources(selections),
      rows = removedRows(
        sources,
        prepareShifts(sources),
        (await this.store.list("target")).filter(
          (t) => t.tenantId === c.tenantId,
        ),
        await this.mappings(),
      );
    if (!rows.length || rows.length > 1000)
      throw new PayrollError(400, "预览必须包含 1–1000 条工资行");
    const id = crypto.randomUUID(),
      p = {
        id,
        actor,
        tenantId: c.tenantId,
        organizationName: c.organizationName,
        selectionRevision: c.selectionRevision,
        selections,
        sourceHash: await digest(sources),
        rows,
        sourceKeys: [...new Set(sources.map((r) => r.sourceKey))],
        status: "Draft",
        createdAt: new Date().toISOString(),
        changes: [],
      };
    await this.store.put("preview:" + id, "preview", p);
    return p;
  }
  async getPreview(id: string) {
    const p = await this.store.get("preview:" + id);
    if (!p) throw new PayrollError(404, "工资预览不存在");
    await this.connection(p.tenantId);
    return p;
  }
  async revisions(id: string, version?: number) {
    await this.getPreview(id);
    if (version !== undefined) {
      const revision = await this.store.get(
        "preview-revision:" + id + ":" + version,
      );
      if (!revision) throw new PayrollError(404, "修正前版本不存在");
      return revision;
    }
    return this.store.sql.query(
      "SELECT id,updated_at FROM payroll_documents WHERE kind=? AND substr(id,1,?)=? ORDER BY updated_at DESC LIMIT 100",
      [
        "preview-revision",
        ("preview-revision:" + id + ":").length,
        "preview-revision:" + id + ":",
      ],
    );
  }
  async savePreview(actor: string, id: string, input: any) {
    const p = await this.getPreview(id);
    if (p.status !== "Draft" || p._version !== input.version)
      throw new PayrollError(409, "预览已锁定或版本已变化");
    if (
      input.rows.length !== p.rows.length ||
      new Set(input.rows.map((r: any) => r.id)).size !== p.rows.length
    )
      throw new PayrollError(400, "工资行集合不一致");
    const beforeImage = structuredClone(p);
    const changes = [];
    for (const patch of input.rows) {
      const row = p.rows.find((r: any) => r.id === patch.id);
      if (!row) throw new PayrollError(400, "未知工资行");
      if (row.requiresBreakAllocation && !patch.breakAllocationConfirmed)
        throw new PayrollError(400, "跨午夜休息需按每日分段核对并明确确认");
      changes.push({
        rowId: row.id,
        before: {
          paidMinutes: row.paidMinutes,
          category: row.category,
          confirmed: row.confirmed,
          unpaidBreakMinutes: row.unpaidBreakMinutes,
        },
        after: patch,
        actor,
        at: new Date().toISOString(),
      });
      Object.assign(row, patch);
    }
    // Retain immutable before-images without growing one D1 row on every edit.
    // Archive first: if the following save fails, no previous state is lost.
    const revisionId = "preview-revision:" + id + ":" + p._version;
    if (!(await this.store.get(revisionId)))
      await this.store.put(revisionId, "preview-revision", {
        previewId: id,
        version: p._version,
        actor,
        archivedAt: new Date().toISOString(),
        before: beforeImage,
      });
    p.changes = changes;
    await this.store.put("preview:" + id, "preview", p);
    await this.store.audit(actor, "PAYROLL_PREVIEW_EDITED", { id, changes });
    return p;
  }
  async validate(id: string, remote = true, mappingVersion?: number) {
    const p = await this.getPreview(id),
      c = await this.connection(p.tenantId),
      refs = await this.references(),
      maps = await this.mappings();
    if (mappingVersion !== undefined && mappingVersion !== maps._version)
      throw new PayrollError(
        409,
        "映射已被其他操作修改，请刷新后重新核对员工与 Rate",
      );
    if (p.selectionRevision !== c.selectionRevision)
      throw new PayrollError(409, "组织已切换，请重新建立预览");
    if (p.sourceHash !== (await digest(await this.loadSources(p.selections))))
      throw new PayrollError(
        409,
        "排班在预览后已变化，请重新建立并确认工资预览",
      );
    const result = buildTargets(p.rows, maps, refs);
    const states: any[] = [];
    for (const t of (await this.store.list("target")).filter(
      (t) => t.tenantId === p.tenantId,
    )) {
      const previous = t.plannedContributions ?? t.contributions ?? [];
      if (
        previous.some(
          (r: any) => p.sourceKeys.includes(r.sourceKey) && r.minutes > 0,
        ) &&
        !result.groups.some(
          (g) => g.employeeId === t.employeeId && g.key === t.targetKey,
        )
      )
        result.errors.push({
          employeeId: t.employeeId,
          date: t.targetKey.split(":")[2],
          reason:
            "Previously synced source changed Xero employee/calendar destination. Reconcile the original timesheet before exporting to another target.",
        });
    }
    if (remote) {
      // Every payroll read carries the fixed tenant header and proves its access.
      for (const g of result.groups) {
        try {
          const sheet = await remoteTarget(this.client, g, p.tenantId);
          states.push({
            key: g.key,
            timesheetId: sheet?.timesheetID ?? null,
            status: sheet?.status ?? "New",
            baseline: sheet ? canonicalSheet(sheet) : null,
          });
        } catch (e) {
          result.errors.push({
            employeeId: g.employeeId,
            date: g.startDate,
            reason: (e as Error).message,
          });
        }
      }
    }
    const output = {
      ...result,
      remote: states,
      mappingHash: await digest({
        employees: maps.employees,
        rates: maps.rates,
        tracking: maps.tracking,
      }),
      totalPaidHours:
        p.rows.reduce((n: number, r: any) => n + r.paidMinutes, 0) / 60,
    };
    if (remote) {
      const id = "preflight:" + p.id,
        previous = await this.store.get(id);
      await this.store.put(id, "preflight", {
        ...previous,
        previewVersion: p._version,
        refsVersion: refs._version,
        checkedAt: Date.now(),
        selectionRevision: c.selectionRevision,
        validation: output,
      });
    }
    return output;
  }
  async confirm(
    actor: string,
    id: string,
    version: number,
    adopt: boolean,
    mappingVersion?: number,
  ) {
    const p = await this.getPreview(id);
    if (p.status !== "Draft" || p._version !== version)
      throw new PayrollError(409, "工资预览已经确认或版本已变化");
    const local = await this.validate(id, false, mappingVersion),
      refs = await this.references(),
      ticket = await this.store.get("preflight:" + id);
    const validation =
      ticket &&
      ticket.previewVersion === p._version &&
      ticket.refsVersion === refs._version &&
      ticket.selectionRevision === p.selectionRevision &&
      ticket.checkedAt > Date.now() - 60000 &&
      ticket.validation.mappingHash === local.mappingHash &&
      JSON.stringify(ticket.validation.groups) === JSON.stringify(local.groups)
        ? ticket.validation
        : await this.validate(id, true, mappingVersion);
    if (validation.errors.length)
      throw new PayrollError(
        400,
        "工资校验失败：" +
          validation.errors
            .slice(0, 5)
            .map((e: any) => `${e.employeeId} ${e.date}: ${e.reason}`)
            .join("；"),
      );
    p.status = "Confirmed";
    p.confirmedBy = actor;
    p.confirmedAt = new Date().toISOString();
    p.validation = validation;
    p.mappingSnapshot = await this.mappings();
    p.adoptExistingDraft = adopt;
    await this.store.put("preview:" + id, "preview", p);
    await this.store.audit(actor, "PAYROLL_CONFIRMED_LOCKED", {
      id,
      tenantId: p.tenantId,
      rowCount: p.rows.length,
    });
    return p;
  }
  async start(actor: string, id: string) {
    const p = await this.getPreview(id);
    if (p.status !== "Confirmed")
      throw new PayrollError(409, "请先确认并锁定实际工时");
    const existing = (await this.store.list("job")).find(
      (j) => j.previewId === id,
    );
    if (existing) return existing;
    const checked = await this.validate(id, false);
    if (checked.errors.length)
      throw new PayrollError(409, checked.errors[0].reason);
    const idJob = crypto.randomUUID(),
      job = {
        id: idJob,
        previewId: id,
        tenantId: p.tenantId,
        actor,
        status: "Processing",
        createdAt: new Date().toISOString(),
        records: p.validation.groups.map((g: any) => ({
          key: g.key,
          employeeId: g.employeeId,
          employeeName: g.employeeName,
          startDate: g.startDate,
          endDate: g.endDate,
          status: "Pending",
        })),
      };
    await this.store.put("job:" + idJob, "job", job);
    await this.store.audit(actor, "XERO_SYNC_REQUESTED", {
      id: idJob,
      previewId: id,
      tenantId: p.tenantId,
    });
    return job;
  }
  async job(id: string) {
    const job = await this.store.get("job:" + id);
    if (!job) throw new PayrollError(404, "同步记录不存在");
    return job;
  }
  async process(actor: string, id: string, retryFailed = false) {
    const job = await this.job(id),
      p = await this.getPreview(job.previewId),
      c = await this.connection(job.tenantId);
    if (c.selectionRevision !== p.selectionRevision)
      throw new PayrollError(409, "连接/组织已变化，禁止继续旧同步");
    const current = await this.validate(p.id, false);
    if (current.errors.length)
      throw new PayrollError(409, current.errors[0].reason);
    if (current.mappingHash !== p.validation.mappingHash)
      throw new PayrollError(409, "员工或 Rate 映射已变化，需重新预览确认");
    const record = job.records.find(
      (r: any) =>
        ["Pending", "Processing"].includes(r.status) ||
        (retryFailed && r.status === "Failed"),
    );
    if (!record) return job;
    if (record.error) {
      record.previousFailures ??= [];
      record.previousFailures.push({
        error: record.error,
        correlationIds: record.correlationIds,
        finishedAt: record.finishedAt,
      });
    }
    delete record.error;
    delete record.finishedAt;
    record.correlationIds = [];
    record.status = "Processing";
    record.startedAt = new Date().toISOString();
    await this.store.put("job:" + id, "job", job);
    try {
      const g = p.validation.groups.find((g: any) => g.key === record.key);
      const employee = (
        await this.client.request(
          "/payroll.xro/1.0/Employees/" + encodeURIComponent(g.employeeID),
          { tenant: p.tenantId },
        )
      ).data.Employees?.[0];
      if (
        !employee ||
        employee.PayrollCalendarID !== g.payrollCalendarID ||
        employee.TerminationDate
      )
        throw new PayrollError(
          409,
          "Xero 员工已离职或 Payroll Calendar 已变化",
        );
      const rates = (
        await this.client.request("/payroll.xro/1.0/PayItems", {
          tenant: p.tenantId,
        })
      ).data.PayItems?.EarningsRates;
      const calendars = (
        await this.client.request("/payroll.xro/1.0/PayrollCalendars", {
          tenant: p.tenantId,
        })
      ).data.PayrollCalendars;
      const maps = await this.mappings(),
        references = await this.references();
      const fresh = buildTargets(
        p.rows.filter(
          (r: any) =>
            r.employeeId === g.employeeId &&
            r.date >= g.startDate &&
            r.date <= g.endDate,
        ),
        maps,
        {
          employees: [employee],
          calendars,
          rates,
          tracking: g.lines.some((l: any) => l.trackingItemID)
            ? await this.client.tracking(p.tenantId)
            : references.tracking,
        },
      );
      const actual = fresh.groups.find((v) => v.key === g.key);
      if (
        fresh.errors.length ||
        fresh.groups.length !== 1 ||
        !actual ||
        JSON.stringify(actual.lines) !== JSON.stringify(g.lines)
      )
        throw new PayrollError(
          409,
          "Xero Calendar or Earnings Rate changed after confirmation; refresh references and reconfirm",
        );
      const contributions = p.rows
        .filter(
          (r: any) =>
            r.employeeId === g.employeeId &&
            r.date >= g.startDate &&
            r.date <= g.endDate,
        )
        .map((r: any) => ({
          sourceKey: r.sourceKey,
          date: r.date,
          earningsRateID: maps.rates[r.category],
          trackingItemID: maps.tracking[r.storeId] ?? null,
          minutes: r.paidMinutes,
          numberOfUnits: Number((r.paidMinutes / 60).toFixed(4)),
        }));
      Object.assign(
        record,
        await syncGroup(
          this.store,
          this.client,
          p.tenantId,
          { ...g, jobId: id, sourceKeys: p.sourceKeys, contributions },
          p.validation.remote.find((r: any) => r.key === g.key)?.baseline,
          p.adoptExistingDraft,
        ),
      );
      const latestConnection = await this.store.get("connection");
      latestConnection.lastSuccessfulSync = new Date().toISOString();
      const metaId = "tenant-meta:" + p.tenantId,
        meta = (await this.store.get(metaId)) ?? {};
      meta.lastSuccessfulSync = latestConnection.lastSuccessfulSync;
      await this.store.put(metaId, "tenant-meta", meta);
      await this.store.put("connection", "connection", latestConnection);
    } catch (e) {
      record.status = "Failed";
      record.error = (e as Error).message;
      record.correlationIds = (e as PayrollError).correlationId
        ? [(e as PayrollError).correlationId]
        : [];
    }
    record.finishedAt = new Date().toISOString();
    job.status = job.records.some((r: any) =>
      ["Pending", "Processing"].includes(r.status),
    )
      ? "Processing"
      : job.records.some((r: any) => r.status === "Failed")
        ? "PartialFailure"
        : "Completed";
    job.updatedAt = new Date().toISOString();
    await this.store.put("job:" + id, "job", job);
    await this.store.audit(actor, "XERO_SYNC_RESULT", { jobId: id, ...record });
    return job;
  }
  async retry(actor: string, id: string) {
    const j = await this.job(id);
    await this.connection(j.tenantId);
    for (const r of j.records) if (r.status === "Failed") r.status = "Pending";
    j.status = j.records.some((r: any) => r.status === "Pending")
      ? "Processing"
      : j.status;
    await this.store.put("job:" + id, "job", j);
    await this.store.audit(actor, "XERO_RETRY_FAILED_REQUESTED", { jobId: id });
    return j;
  }
  async history() {
    return (await this.store.list("job")).slice(0, 100);
  }
  async targets() {
    const c = await this.connection();
    return (await this.store.list("target")).filter(
      (t) => t.tenantId === c.tenantId,
    );
  }
  async reconcileTarget(
    actor: string,
    id: string,
    version: number,
    timesheetId: string,
  ) {
    const c = await this.connection(),
      target = await this.store.get(id);
    if (
      !target ||
      target.tenantId !== c.tenantId ||
      target._version !== version
    )
      throw new PayrollError(409, "目标已变化，请刷新后重试");
    const parts = target.targetKey.split(":"),
      sheet = await this.client.sheet(timesheetId, c.tenantId);
    if (
      !Array.isArray(sheet.timesheetLines) ||
      typeof sheet.totalHours !== "number" ||
      Math.abs(
        sheet.timesheetLines.reduce(
          (n: number, l: any) => n + Number(l.numberOfUnits),
          0,
        ) - sheet.totalHours,
      ) > 0.00011
    )
      throw new PayrollError(
        502,
        "Incomplete or inconsistent Xero timesheet; cannot release source association",
      );
    if (
      sheet.employeeID !== parts[0] ||
      sheet.payrollCalendarID !== parts[1] ||
      sheet.startDate.slice(0, 10) !== parts[2] ||
      sheet.endDate.slice(0, 10) !== parts[3] ||
      sheet.status !== "Draft"
    )
      throw new PayrollError(409, "只能核对原目标的 Draft 工时表");
    if (target.timesheetId && target.timesheetId !== timesheetId)
      throw new PayrollError(409, "Timesheet ID 与原同步记录不一致");
    const previous = target.plannedContributions ?? target.contributions ?? [];
    if (
      sheet.timesheetLines?.some(
        (line: any) =>
          Number(line.numberOfUnits) > 0 &&
          (target.ownedLineIds?.includes(line.timesheetLineID) ||
            previous.some(
              (r: any) =>
                r.date === line.date.slice(0, 10) &&
                r.earningsRateID === line.earningsRateID &&
                (r.trackingItemID ?? "") === (line.trackingItemID ?? ""),
            )),
      )
    )
      throw new PayrollError(
        409,
        "Xero 中仍有原目标工时，请先人工核对并清除旧 Draft 工时；系统不会替你删除员工工时表",
      );
    await this.store.audit(actor, "XERO_TARGET_RECONCILED", {
      id,
      timesheetId,
      previous,
      at: new Date().toISOString(),
    });
    target.contributions = [];
    target.plannedContributions = null;
    target.ownedLineIds = [];
    target.pending = null;
    target.reconciledBy = actor;
    target.reconciledAt = new Date().toISOString();
    await this.store.put(id, "target", target);
    return target;
  }
}
