import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { apiRequest } from "../../lib/apiClient";
import { AppSelect } from "../ui/AppSelect";
type Selection = { storeId: string; periodId?: string; publicationId?: string };
type Row = {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  date: string;
  startAt: string;
  endAt: string;
  timezone: string;
  scheduledMinutes: number;
  unpaidBreakMinutes: number;
  paidMinutes: number;
  category: string;
  confirmed: boolean;
  reason: string;
  requiresBreakAllocation?: boolean;
  removedFromRoster?: boolean;
  breakAllocationConfirmed?: boolean;
};
type Preview = {
  id: string;
  _version: number;
  organizationName: string;
  tenantId: string;
  status: string;
  rows: Row[];
};
type Maps = {
  tenantId: string;
  _version: number;
  employees: Record<string, { xeroEmployeeId: string; status: "Matched" }>;
  rates: Record<string, string>;
  tracking: Record<string, string>;
};
type References = {
  employees: {
    EmployeeID: string;
    EmployeeNumber?: string;
    FirstName: string;
    LastName: string;
    Email?: string;
    Status?: string;
    TerminationDate?: string;
    PayrollCalendarID?: string;
  }[];
  calendars: {
    PayrollCalendarID: string;
    Name: string;
    CalendarType: string;
    StartDate: string;
  }[];
  rates: {
    EarningsRateID: string;
    Name: string;
    RateType: string;
    TypeOfUnits?: string;
  }[];
  tracking: { TrackingItemID: string; Name: string }[];
  fetchedAt: string;
};
type Connection = {
  configured: boolean;
  connected: boolean;
  tenantId: string | null;
  organizationName: string | null;
  lastConnectionTime: string | null;
  lastSuccessfulSync: string | null;
  reauthorizationRequired: boolean;
  organizations: { tenantId: string; tenantName: string }[];
};
type Validation = {
  errors: { employeeId: string; date: string; reason: string }[];
  groups: {
    key: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    lines: { numberOfUnits: number }[];
  }[];
  totalPaidHours: number;
  remote: {
    key: string;
    timesheetId: string | null;
    status: string;
    baseline: { lines: { numberOfUnits: number }[] } | null;
  }[];
};
type Job = {
  id: string;
  previewId: string;
  tenantId: string;
  status: string;
  createdAt: string;
  records: {
    key: string;
    employeeId: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    status: string;
    error?: string;
    timesheetId?: string;
    hours?: number;
    finishedAt?: string;
    correlationIds?: string[];
  }[];
};
const call = <T,>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) =>
  apiRequest<T>("/payroll" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(180000),
  });
const button =
  "calendar-text-button disabled:cursor-not-allowed disabled:opacity-50";
const amount = (minutes: number) => (minutes / 60).toFixed(4);
function TargetReconciliation({
  target,
  busy,
  onReconcile,
}: {
  target: Target;
  busy: boolean;
  onReconcile: (id: string) => void;
}) {
  const [checked, setChecked] = useState(false),
    [id, setId] = useState(target.timesheetId ?? "");
  return (
    <div className="text-sm">
      <p>{target.employeeName ?? target.employeeId}</p>
      <p className="break-all text-xs text-graphite-600">{target.targetKey}</p>
      <label className="mt-2 block">
        原 Xero Timesheet ID
        <input
          className="native-input mt-1 block w-full max-w-lg"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
      </label>
      <label className="mt-2 flex gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        已在 Xero 人工核对并清除原来源对应的 Draft 工时
      </label>
      <button
        type="button"
        className={button + " mt-2"}
        disabled={busy || !checked || !id}
        onClick={() => onReconcile(id)}
      >
        核对远端并解除旧来源关联
      </button>
    </div>
  );
}
type Target = {
  id: string;
  _version: number;
  employeeId: string;
  employeeName?: string;
  timesheetId?: string;
  targetKey: string;
};
export function PayrollPanel({
  selection,
  stores,
}: {
  selection: Selection | null;
  stores: { id: string; name: string }[];
}) {
  const [connection, setConnection] = useState<Connection | null>(null),
    [refs, setRefs] = useState<References | null>(null),
    [maps, setMaps] = useState<Maps | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [validation, setValidation] = useState<Validation | null>(null),
    [job, setJob] = useState<Job | null>(null),
    [history, setHistory] = useState<Job[]>([]),
    [error, setError] = useState(() =>
      new URLSearchParams(window.location.search).get("xero") === "error"
        ? "Xero 授权未完成、已过期或回调失败。请保持原 Roster 管理员登录，检查服务端配置后重新连接。"
        : "",
    ),
    [busy, setBusy] = useState(""),
    [adopt, setAdopt] = useState(false),
    [categories, setCategories] = useState([
      "Ordinary",
      "Saturday",
      "Sunday",
      "Public Holiday",
      "Overtime",
    ]),
    [newCategory, setNewCategory] = useState(""),
    [sources, setSources] = useState<Selection[]>([]),
    [otherStore, setOtherStore] = useState(""),
    [periods, setPeriods] = useState<
      { id: string; startDate: string; endDate: string }[]
    >([]),
    [otherPeriod, setOtherPeriod] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [rowDirty, setRowDirty] = useState(false),
    [mapDirty, setMapDirty] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const acceptPreview = (p: Preview) => {
    setPreview(p);
    setRowDirty(false);
  };
  const acceptMaps = (m: Maps) => {
    setMaps(m);
    setMapDirty(false);
  };
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请刷新状态后重试");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    let active = true;
    call<Connection>("/status")
      .then((v) => {
        if (active) setConnection(v);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    const c = await call<Connection>("/status");
    setConnection(c);
    if (c.connected) {
      const [r, m] = await Promise.all([
        call<References>("/references"),
        call<Maps>("/mappings"),
      ]);
      setRefs(r);
      acceptMaps(m);
      setCategories((old) => [...new Set([...old, ...Object.keys(m.rates)])]);
    }
  }
  const employees = [
    ...new Map((preview?.rows ?? []).map((r) => [r.employeeId, r])).values(),
  ];
  const addSource = (s: Selection) =>
    setSources((old) =>
      old.some((x) => JSON.stringify(x) === JSON.stringify(s))
        ? old
        : [...old, s],
    );
  const updateRow = (id: string, patch: Partial<Row>) => {
    setRowDirty(true);
    setValidation(null);
    setPreview((p) =>
      p
        ? {
            ...p,
            rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          }
        : p,
    );
  };
  async function process(id: string, retry = false) {
    let current = retry
      ? await call<Job>("/jobs/" + id + "/retry", {})
      : await call<Job>("/jobs/" + id);
    setJob(current);
    for (let i = 0; i < 100; i++) {
      if (
        !current.records.some((r) =>
          ["Pending", "Processing"].includes(r.status),
        )
      )
        break;
      current = await call<Job>("/jobs/" + id + "/process", {});
      setJob(current);
    }
    await refresh();
  }
  return (
    <section
      className="mt-6 border-t border-graphite-200 py-6"
      aria-labelledby="xero-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="xero-heading"
            className="text-xl font-semibold text-graphite-950"
          >
            Xero Payroll
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-graphite-600">
            将已核对的实际工时同步至澳洲 Payroll Draft
            Timesheets。计划工时需要管理员确认；不会审批、结算 Pay Run
            或发工资。
          </p>
        </div>
        <button
          type="button"
          className={button}
          disabled={!!busy}
          onClick={() => void run("刷新连接", refresh)}
        >
          <RefreshCw className="mr-2 inline h-4 w-4" />
          刷新状态
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span>
          {connection?.connected
            ? "已连接：" + connection.organizationName
            : connection?.configured
              ? "尚未连接 Organization"
              : "服务端尚未配置 Xero App"}
        </span>
        {connection?.reauthorizationRequired && (
          <strong className="text-red-700">需要重新授权</strong>
        )}
        <button
          type="button"
          className={button}
          disabled={!!busy || !connection?.configured}
          onClick={() =>
            void run("连接 Xero", async () => {
              const { url } = await call<{ url: string }>("/connect", {});
              window.location.assign(url);
            })
          }
        >
          Connect to Xero <ExternalLink className="ml-1 inline h-4 w-4" />
        </button>
        {connection?.connected && (
          <button
            type="button"
            className={button}
            disabled={!!busy}
            onClick={() =>
              void run("断开 Xero", async () => {
                setConnection(await call<Connection>("/disconnect", {}));
                setRefs(null);
                setMaps(null);
                setPreview(null);
                setJob(null);
              })
            }
          >
            断开 Xero 授权
          </button>
        )}
      </div>
      {connection && !connection.configured && (
        <p className="mt-3 text-sm text-graphite-600">
          管理员需在后端配置 Xero Web App 的 Client ID、Client Secret、Token
          加密密钥及 OAuth Redirect URI。原 CSV 和打印导出仍可使用。
        </p>
      )}
      {!!connection?.organizations.length && (
        <div className="mt-4 max-w-lg">
          <AppSelect
            label="目标 Xero Organization（切换后需重新预览）"
            value={connection.tenantId ?? "none"}
            disabled={!!busy}
            options={[
              { value: "none", label: "请选择 Organization" },
              ...connection.organizations.map((o) => ({
                value: o.tenantId,
                label: o.tenantName + " · " + o.tenantId,
              })),
            ]}
            onValueChange={(id) => {
              if (id !== "none")
                void run("选择组织", async () => {
                  setConnection(
                    await call<Connection>("/tenant", {
                      tenantId: id,
                      expectedTenantId: connection.tenantId,
                    }),
                  );
                  setPreview(null);
                  setJob(null);
                  await refresh();
                });
            }}
          />
        </div>
      )}
      {connection?.connected && (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-graphite-600">
            <div>
              <dt>连接时间</dt>
              <dd>{connection.lastConnectionTime ?? "—"}</dd>
            </div>
            <div>
              <dt>最后成功同步</dt>
              <dd>{connection.lastSuccessfulSync ?? "尚无成功同步"}</dd>
            </div>
            <div>
              <dt>定期同步</dt>
              <dd>关闭（当前未配置可靠后台调度）</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={button}
              disabled={!!busy || !selection}
              onClick={() => selection && addSource(selection)}
            >
              添加当前排班周期
            </button>
            <button
              type="button"
              className={button}
              disabled={!!busy || (!sources.length && !selection)}
              onClick={() =>
                void run("准备工时预览", async () => {
                  await refresh();
                  acceptPreview(
                    await call<Preview>("/previews", {
                      selections: sources.length ? sources : [selection],
                    }),
                  );
                  setValidation(null);
                  setJob(null);
                })
              }
            >
              Sync to Xero · 预览工时
            </button>
            <button
              type="button"
              className={button}
              disabled={!!busy}
              onClick={() =>
                void run("读取同步历史", async () =>
                  setHistory(await call<Job[]>("/jobs")),
                )
              }
            >
              Sync History
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-graphite-600">
            {sources.map((s, i) => (
              <li key={JSON.stringify(s)}>
                {stores.find((x) => x.id === s.storeId)?.name ?? s.storeId} ·{" "}
                {s.periodId ?? s.publicationId}
                <button
                  type="button"
                  className="ml-3 underline"
                  aria-label={"移除来源 " + s.storeId}
                  disabled={!!busy}
                  onClick={() => setSources(sources.filter((_, j) => i !== j))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              合并其他门店/周期
            </summary>
            <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AppSelect
                label="其他门店"
                value={otherStore || "none"}
                onValueChange={(s) => {
                  setOtherStore(s);
                  setPeriods([]);
                  setOtherPeriod("");
                }}
                options={[
                  { value: "none", label: "请选择" },
                  ...stores.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <label className="text-sm">
                查询开始
                <input
                  type="date"
                  className="native-input mt-1 w-full"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                查询结束
                <input
                  type="date"
                  className="native-input mt-1 w-full"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={button}
                disabled={!!busy || !otherStore || !from || !to}
                onClick={() =>
                  void run("查询其他周期", async () => {
                    const list = await apiRequest<
                      { id: string; startDate: string; endDate: string }[]
                    >(
                      "/roster/periods?" +
                        new URLSearchParams({ storeId: otherStore, from, to }),
                    );
                    setPeriods(list);
                    setOtherPeriod(list[0]?.id ?? "");
                  })
                }
              >
                查询周期
              </button>
              <AppSelect
                label="其他排班周期"
                value={otherPeriod || "none"}
                onValueChange={setOtherPeriod}
                options={
                  periods.length
                    ? periods.map((p) => ({
                        value: p.id,
                        label: p.startDate + " 至 " + p.endDate,
                      }))
                    : [{ value: "none", label: "请先查询" }]
                }
              />
              <button
                type="button"
                className={button}
                disabled={!!busy || !otherPeriod}
                onClick={() =>
                  addSource({ storeId: otherStore, periodId: otherPeriod })
                }
              >
                加入预览来源
              </button>
            </div>
          </details>
        </>
      )}
      {connection?.connected && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold">
            处理员工/Calendar 改配后的旧同步目标
          </summary>
          <p className="mt-2 max-w-3xl text-sm text-graphite-600">
            已同步来源不能直接改送另一名员工或 Calendar。先在 Xero
            人工核对并清除原 Draft 的对应工时，再在此验证。此操作不删除 Xero
            员工工时表。
          </p>
          <button
            type="button"
            className={button + " mt-3"}
            disabled={!!busy}
            onClick={() =>
              void run("读取同步目标", async () =>
                setTargets(await call<Target[]>("/targets")),
              )
            }
          >
            读取原同步目标
          </button>
          <ul className="mt-3 space-y-4">
            {targets.map((t) => (
              <li key={t.id}>
                <TargetReconciliation
                  target={t}
                  busy={!!busy}
                  onReconcile={(timesheetId) =>
                    void run("验证原目标工时已清除", async () => {
                      await call(
                        "/targets/" + encodeURIComponent(t.id) + "/reconcile",
                        { version: t._version, timesheetId, confirmed: true },
                      );
                      setTargets(await call<Target[]>("/targets"));
                      setPreview(null);
                      setValidation(null);
                      setRowDirty(false);
                      setMapDirty(false);
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </details>
      )}
      {(rowDirty || mapDirty) && (
        <p role="status" className="mt-3 text-sm text-amber-900">
          当前修改尚未保存。请先保存工时和映射，再进行校验或同步。
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm text-graphite-600"
      >
        {busy ? busy + "…" : ""}
      </p>
      {preview && refs && maps && (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold">员工与 Earnings Rate 映射</h3>
            <p className="mt-1 text-sm text-graphite-600">
              姓名仅用于显示。每个 Xero Employee ID 必须人工确认；Payroll
              Calendar 由该员工的 Xero 配置决定。周末、Public Holiday 和
              Overtime 类别均由管理员选择，不自动推定工资规则。
            </p>
            <button
              type="button"
              className={button}
              disabled={!!busy}
              onClick={() =>
                void run("刷新 Xero 员工与设置", async () => {
                  setRefs(await call<References>("/references/refresh", {}));
                  setValidation(null);
                })
              }
            >
              重新获取 Xero 员工和设置
            </button>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {employees.map((e) => {
                const m = maps.employees[e.employeeId],
                  remote = refs.employees.find(
                    (x) => x.EmployeeID === m?.xeroEmployeeId,
                  );
                return (
                  <div key={e.employeeId}>
                    <AppSelect
                      label={
                        e.employeeName +
                        " · " +
                        (m
                          ? remote
                            ? "Matched"
                            : "Needs Review"
                          : "Unmatched")
                      }
                      disabled={!!busy || preview.status !== "Draft"}
                      value={m?.xeroEmployeeId ?? "none"}
                      options={[
                        { value: "none", label: "未匹配" },
                        ...refs.employees.map((x) => ({
                          value: x.EmployeeID,
                          label: [
                            x.FirstName + " " + x.LastName,
                            x.EmployeeNumber,
                            x.Email,
                            x.Status,
                            x.EmployeeID,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          disabled: !!x.TerminationDate,
                        })),
                      ]}
                      onValueChange={(id) => {
                        const next = { ...maps.employees };
                        if (id === "none") delete next[e.employeeId];
                        else
                          next[e.employeeId] = {
                            xeroEmployeeId: id,
                            status: "Matched",
                          };
                        setMaps({ ...maps, employees: next });
                        setMapDirty(true);
                        setValidation(null);
                      }}
                    />
                    {remote && (
                      <p className="mt-1 break-all text-xs text-graphite-600">
                        Calendar：
                        {refs.calendars.find(
                          (c) =>
                            c.PayrollCalendarID === remote.PayrollCalendarID,
                        )?.Name ?? "未设置"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <AppSelect
                  key={c}
                  label={c + " → Earnings Rate"}
                  value={maps.rates[c] ?? "none"}
                  disabled={!!busy || preview.status !== "Draft"}
                  options={[
                    { value: "none", label: "未配置（使用此类别将阻止同步）" },
                    ...refs.rates.map((r) => ({
                      value: r.EarningsRateID,
                      label:
                        r.Name +
                        " · " +
                        r.RateType +
                        " · " +
                        (r.TypeOfUnits ?? ""),
                    })),
                  ]}
                  onValueChange={(id) => {
                    const rates = { ...maps.rates };
                    if (id === "none") delete rates[c];
                    else rates[c] = id;
                    setMaps({ ...maps, rates });
                    setMapDirty(true);
                    setValidation(null);
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="native-input"
                aria-label="新增 Earnings Category"
                placeholder="自定义类别"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button
                type="button"
                className={button}
                disabled={
                  !!busy || !newCategory.trim() || preview.status !== "Draft"
                }
                onClick={() => {
                  setCategories([
                    ...new Set([...categories, newCategory.trim()]),
                  ]);
                  setNewCategory("");
                }}
              >
                添加类别
              </button>
            </div>
            {!!refs.tracking.length && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[...new Set(preview.rows.map((r) => r.storeId))].map((s) => (
                  <AppSelect
                    key={s}
                    label={s + " → Tracking Item（可选）"}
                    value={maps.tracking[s] ?? "none"}
                    disabled={!!busy || preview.status !== "Draft"}
                    options={[
                      { value: "none", label: "不使用 Tracking" },
                      ...refs.tracking.map((t) => ({
                        value: t.TrackingItemID,
                        label: t.Name,
                      })),
                    ]}
                    onValueChange={(id) => {
                      const tracking = { ...maps.tracking };
                      if (id === "none") delete tracking[s];
                      else tracking[s] = id;
                      setMaps({ ...maps, tracking });
                      setMapDirty(true);
                      setValidation(null);
                    }}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className={button + " mt-4"}
              disabled={!!busy || preview.status !== "Draft"}
              onClick={() =>
                void run("保存人工确认映射", async () => {
                  acceptMaps(
                    await call<Maps>(
                      "/mappings",
                      {
                        tenantId: maps.tenantId,
                        version: maps._version,
                        employees: maps.employees,
                        rates: maps.rates,
                        tracking: maps.tracking,
                      },
                      "PUT",
                    ),
                  );
                  setValidation(null);
                })
              }
            >
              保存映射
            </button>
          </div>
          <div>
            <h3 className="font-semibold">
              Payroll Preview · {preview.organizationName}
            </h3>
            <p className="mt-1 text-sm text-graphite-600">
              {employees.length} 位员工 · 已选{" "}
              {new Set(preview.rows.map((r) => r.storeId)).size} 家门店 ·
              实际工时{" "}
              {amount(preview.rows.reduce((n, r) => n + r.paidMinutes, 0))} 小时
              · {preview.status === "Draft" ? "待确认" : "已确认并锁定"}
            </p>
            <p className="mt-1 text-sm text-graphite-600">
              跨午夜班次按门店当地日期拆分；未记录具体休息时间的跨日班次，需逐行核对休息分配。全部工时保留分钟精度，发送前汇总至
              4 位小数小时。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b border-graphite-200 text-graphite-600">
                  <tr>
                    {[
                      "员工 / 门店",
                      "当地日期 / 起止",
                      "计划小时",
                      "未付休息分钟",
                      "实际分钟",
                      "工资类别",
                      "确认说明",
                      "确认",
                    ].map((h) => (
                      <th scope="col" key={h} className="px-2 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.id} className="border-b border-graphite-100">
                      <td className="px-2 py-3">
                        {r.employeeName}
                        {r.removedFromRoster && (
                          <p className="mt-1 text-xs font-semibold text-amber-900">
                            原排班已移除：确认清除旧同步工时
                          </p>
                        )}
                        <div className="text-xs text-graphite-600">
                          {r.storeId}
                        </div>
                      </td>
                      <td className="px-2 py-3 tabular-nums">
                        {r.date}
                        <div className="text-xs text-graphite-600">
                          {new Date(r.startAt).toLocaleTimeString("en-AU", {
                            timeZone: r.timezone,
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          –
                          {new Date(r.endAt).toLocaleTimeString("en-AU", {
                            timeZone: r.timezone,
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-2 py-3 tabular-nums">
                        {amount(r.scheduledMinutes)}
                      </td>
                      <td className="px-2 py-3">
                        <input
                          aria-label={
                            r.employeeName + " " + r.date + " 未付休息分钟"
                          }
                          type="number"
                          min="0"
                          max="1440"
                          step="1"
                          className="native-input w-24"
                          disabled={preview.status !== "Draft" || !!busy}
                          value={r.unpaidBreakMinutes}
                          onChange={(e) => {
                            const minutes = Number(e.target.value);
                            updateRow(r.id, {
                              unpaidBreakMinutes: minutes,
                              paidMinutes: Math.max(
                                0,
                                r.paidMinutes + r.unpaidBreakMinutes - minutes,
                              ),
                              confirmed: false,
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          aria-label={
                            r.employeeName + " " + r.date + " 实际分钟"
                          }
                          type="number"
                          min="0"
                          max="1440"
                          step="1"
                          className="native-input w-24"
                          disabled={preview.status !== "Draft" || !!busy}
                          value={r.paidMinutes}
                          onChange={(e) =>
                            updateRow(r.id, {
                              paidMinutes: Number(e.target.value),
                              confirmed: false,
                            })
                          }
                        />
                        <span className="block text-xs tabular-nums">
                          {amount(r.paidMinutes)} h
                        </span>
                      </td>
                      <td className="min-w-40 px-2 py-3">
                        <AppSelect
                          ariaLabel={
                            r.employeeName + " " + r.date + " 工资类别"
                          }
                          value={r.category || "none"}
                          disabled={preview.status !== "Draft" || !!busy}
                          options={[
                            { value: "none", label: "请选择" },
                            ...categories.map((c) => ({ value: c, label: c })),
                          ]}
                          onValueChange={(c) =>
                            updateRow(r.id, {
                              category: c === "none" ? "" : c,
                              confirmed: false,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          aria-label={
                            r.employeeName + " " + r.date + " 确认或调整说明"
                          }
                          className="native-input w-44"
                          disabled={preview.status !== "Draft" || !!busy}
                          placeholder="至少 3 个字"
                          value={r.reason}
                          onChange={(e) =>
                            updateRow(r.id, {
                              reason: e.target.value,
                              confirmed: false,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-3">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            disabled={preview.status !== "Draft" || !!busy}
                            checked={r.confirmed}
                            onChange={(e) =>
                              updateRow(r.id, {
                                confirmed: e.target.checked,
                                breakAllocationConfirmed: e.target.checked,
                              })
                            }
                          />
                          <span>
                            {r.requiresBreakAllocation
                              ? "确认实际分钟及跨日休息分配"
                              : "确认实际工时"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={button}
                disabled={!!busy || preview.status !== "Draft"}
                onClick={() =>
                  void run("保存工时修正", async () => {
                    const rows = preview.rows.map((r) => ({
                      id: r.id,
                      paidMinutes: r.paidMinutes,
                      unpaidBreakMinutes: r.unpaidBreakMinutes,
                      category: r.category,
                      confirmed: r.confirmed,
                      reason: r.reason,
                      breakAllocationConfirmed: r.breakAllocationConfirmed,
                    }));
                    acceptPreview(
                      await call<Preview>(
                        "/previews/" + preview.id,
                        { version: preview._version, rows },
                        "PUT",
                      ),
                    );
                    setValidation(null);
                  })
                }
              >
                保存工时确认 / 调整
              </button>
              <button
                type="button"
                className={button}
                disabled={!!busy || rowDirty || mapDirty}
                onClick={() =>
                  void run("校验工资数据与 Xero 状态", async () =>
                    setValidation(
                      await call<Validation>(
                        "/previews/" + preview.id + "/validate",
                        { mappingVersion: maps._version },
                      ),
                    ),
                  )
                }
              >
                校验 Payroll Period 与 Xero
              </button>
            </div>
            {validation && (
              <div className="mt-4">
                <h4 className="font-semibold">
                  校验结果 · {validation.groups.length} 个员工发薪周期
                </h4>
                {validation.errors.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    {validation.errors.map((e, i) => (
                      <li key={i}>
                        {employees.find((x) => x.employeeId === e.employeeId)
                          ?.employeeName ?? e.employeeId}{" "}
                        · {e.date}：{e.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm">
                    校验通过。请核对下列实际发薪周期与现有
                    Draft，然后确认并锁定。
                  </p>
                )}
                <ul className="mt-2 space-y-2 text-sm">
                  {validation.groups.map((g) => {
                    const remote = validation.remote.find(
                      (r) => r.key === g.key,
                    );
                    return (
                      <li key={g.key}>
                        {g.employeeName} · {g.startDate} 至 {g.endDate} ·{" "}
                        {g.lines
                          .reduce((n, l) => n + l.numberOfUnits, 0)
                          .toFixed(4)}{" "}
                        h · {remote?.status ?? "未读取"}
                        {remote?.timesheetId && (
                          <span className="block break-all text-xs text-graphite-600">
                            现有工时{" "}
                            {remote.baseline?.lines
                              .reduce((n, l) => n + l.numberOfUnits, 0)
                              .toFixed(4)}{" "}
                            h · Timesheet ID {remote.timesheetId}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {preview.status === "Draft" ? (
              <>
                <label className="mt-4 flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={adopt}
                    onChange={(e) => setAdopt(e.target.checked)}
                    disabled={!!busy}
                  />
                  允许采用并更新已有 Draft 的匹配日期/Rate/Tracking
                  行；其他人工行保留。请先核对上述差异。
                </label>
                <button
                  type="button"
                  className={button + " mt-4"}
                  disabled={
                    !!busy ||
                    rowDirty ||
                    mapDirty ||
                    !validation ||
                    !!validation.errors.length
                  }
                  onClick={() =>
                    void run("确认并锁定工资", async () =>
                      acceptPreview(
                        await call<Preview>(
                          "/previews/" + preview.id + "/confirm",
                          {
                            version: preview._version,
                            adoptExistingDraft: adopt,
                            mappingVersion: maps._version,
                          },
                        ),
                      ),
                    )
                  }
                >
                  确认并锁定实际工时
                </button>
              </>
            ) : (
              <button
                type="button"
                className={button + " mt-4"}
                disabled={!!busy || rowDirty || mapDirty}
                onClick={() =>
                  void run("同步 Xero Draft Timesheets", async () => {
                    const j = await call<Job>(
                      "/previews/" + preview.id + "/sync",
                      {},
                    );
                    setJob(j);
                    await process(j.id);
                  })
                }
              >
                Sync to Xero · 仅写 Draft
              </button>
            )}
          </div>
        </div>
      )}
      {job && (
        <div className="mt-6">
          <h3 className="font-semibold">同步结果 · {job.status}</h3>
          <p className="mt-2 text-sm">
            成功 {job.records.filter((r) => r.status === "Success").length} ·
            跳过 {job.records.filter((r) => r.status === "Skipped").length} ·
            失败 {job.records.filter((r) => r.status === "Failed").length} ·
            已核对{" "}
            {job.records
              .filter((r) => ["Success", "Skipped"].includes(r.status))
              .reduce((n, r) => n + (r.hours ?? 0), 0)
              .toFixed(4)}{" "}
            小时
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {job.records.map((r) => (
              <li key={r.key}>
                {r.employeeName} · {r.startDate} 至 {r.endDate} · {r.status}
                {r.timesheetId && (
                  <div className="break-all text-xs text-graphite-600">
                    Timesheet ID：{r.timesheetId} · {r.finishedAt}
                  </div>
                )}
                {r.error && <p className="text-red-700">{r.error}</p>}
                {!!r.correlationIds?.length && (
                  <p className="break-all text-xs">
                    Correlation ID：{r.correlationIds.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className={button}
              disabled={!!busy}
              onClick={() =>
                void run("重新读取同步状态", async () =>
                  setJob(await call<Job>("/jobs/" + job.id)),
                )
              }
            >
              刷新结果
            </button>
            <button
              type="button"
              className={button}
              disabled={!!busy}
              onClick={() =>
                void run("继续尚未完成的员工", () => process(job.id))
              }
            >
              继续未完成
            </button>
            <button
              type="button"
              className={button}
              disabled={
                !!busy || !job.records.some((r) => r.status === "Failed")
              }
              onClick={() =>
                void run("仅重试失败员工", () => process(job.id, true))
              }
            >
              仅重试失败员工
            </button>
          </div>
        </div>
      )}
      {!!history.length && (
        <div className="mt-6">
          <h3 className="font-semibold">Sync History</h3>
          <ul className="mt-2 space-y-2">
            {history.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  className="text-left text-sm underline"
                  disabled={!!busy}
                  onClick={() =>
                    void run("读取同步记录", async () =>
                      setJob(await call<Job>("/jobs/" + j.id)),
                    )
                  }
                >
                  {j.createdAt} · {j.status} · {j.records.length} 个员工周期
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
