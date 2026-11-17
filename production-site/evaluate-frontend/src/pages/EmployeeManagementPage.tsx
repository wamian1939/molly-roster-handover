import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUpCircle,
  Eye,
  EyeOff,
  FilePenLine,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { EmployeeStatusBadge } from "../components/badges/EmployeeStatusBadge";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { StoreJobTags, StoreJobTag } from "../components/badges/StoreJobTag";
import { PageContainer } from "../components/layout/PageContainer";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { Dialog } from "../components/ui/Dialog";
import { AppSelect } from "../components/ui/AppSelect";
import {
  employeeRepository,
  type EmployeeMutationPayload,
  type PaginatedEmployeeResponse,
} from "../services/employeeRepository";
import { evaluationRepository } from "../services/evaluationRepository";
import type {
  Employee,
  EmployeeSensitiveProfile,
  EmployeeStatus,
  EmployeeType,
  Store,
  StoreJob,
  StoreJobColorToken,
} from "../types/evaluation";
import { withEvaluationNavigation } from "../lib/evaluationNavigation";
import { useAuth } from "../auth/AuthContext";

const pageSize = 25;
const blank: EmployeeMutationPayload = {
  storeId: "",
  displayName: "",
  surname: null,
  givenName: null,
  englishName: null,
  gender: null,
  dateOfBirth: null,
  employeeType: "REGULAR",
  employmentType: "Part-time",
  status: "Active",
  emailAddress: null,
  mobileTelephoneNumber: null,
  addressLine: null,
  suburb: null,
  state: null,
  postcode: null,
  employmentCommencementDate: null,
  holdsWorkingHolidayVisa: null,
  visaType: null,
  bankAccountName: null,
  bsbNumber: null,
  bankAccountNumber: null,
  taxFileNumber: null,
  abn: null,
  superannuationCompany: null,
  superannuationAccountNumber: null,
  uniqueSuperannuationIdentifier: null,
  jobIds: [],
};

export function EmployeeManagementPage() {
  const location = useLocation();
  const { selectedStoreId, user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [jobs, setJobs] = useState<StoreJob[]>([]);
  const [data, setData] = useState<PaginatedEmployeeResponse>({
    items: [],
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  });
  const [filters, setFilters] = useState({
    search: "",
    storeId: selectedStoreId ?? "all",
    employeeType: "all",
    employmentType: "all",
    status: "Active",
    jobId: "all",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeMutationPayload>(blank);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [promotingEmployee, setPromotingEmployee] = useState<Employee | null>(
    null,
  );
  const [promoting, setPromoting] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [archiveUpdating, setArchiveUpdating] = useState(false);
  const mounted = useRef(false);
  const loadSequence = useRef(0);
  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const [nextStores, nextJobs, next] = await Promise.all([
        evaluationRepository.fetchStores(),
        employeeRepository.fetchStoreJobs(filters.storeId === "all" ? undefined : filters.storeId, isAdmin),
        employeeRepository.fetchEmployees({
          page,
          pageSize,
          search: filters.search || undefined,
          storeId: filters.storeId === "all" ? undefined : filters.storeId,
          employeeType: filters.employeeType as EmployeeType | "all",
          employmentType: filters.employmentType as
            Employee["employmentType"] | "all",
          status: filters.status as EmployeeStatus | "all",
          jobId: filters.jobId,
        }),
      ]);
      if (mounted.current && sequence === loadSequence.current) {
        setStores(nextStores);
        setJobs(nextJobs);
        setData(next);
      }
    } catch (reason) {
      if (mounted.current && sequence === loadSequence.current) {
        setError(reason instanceof Error ? reason.message : "无法加载员工档案。");
      }
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [filters, isAdmin, page]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [
    filters.search,
    filters.storeId,
    filters.employeeType,
    filters.employmentType,
    filters.status,
    filters.jobId,
  ]);
  useEffect(() => {
    if (selectedStoreId) setFilters((current) => ({ ...current, storeId: selectedStoreId }));
  }, [selectedStoreId]);

  const openCreate = () => {
    setProfileLoading(false);
    setProfileLoaded(true);
    setEditing(null);
    setForm({
      ...blank,
      storeId:
        filters.storeId !== "all" ? filters.storeId : (stores[0]?.id ?? ""),
    });
    setFormError(null);
    setFormOpen(true);
  };
  const openEdit = async (employee: Employee) => {
    setEditing(employee);
    setForm(blank);
    setProfileLoading(true);
    setProfileLoaded(false);
    setFormError(null);
    setFormOpen(true);
    try {
      const profile = await employeeRepository.fetchEmployeeProfile(employee.id);
      setEditing(profile);
      setForm(profileToForm(profile));
      setProfileLoaded(true);
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "无法读取员工完整档案。",
      );
    } finally {
      setProfileLoading(false);
    }
  };
  const save = async () => {
    if (profileLoading || !profileLoaded || (editing && !form.storeId)) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await employeeRepository.updateEmployee(editing.id, { ...form, expectedUpdatedAt: editing.updatedAt });
      else await employeeRepository.createEmployee(form);
      setFeedback(`${form.displayName} 已保存。`);
      setFormOpen(false);
      await load();
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "无法保存员工档案。",
      );
    } finally {
      setSaving(false);
    }
  };
  const changeArchive = async (employee: Employee) => {
    if (employee.status !== "Archived") {
      setArchiveTarget(employee);
      return;
    }
    try {
      await employeeRepository.restoreEmployee(employee.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法更新员工状态。");
    }
  };
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiveUpdating(true);
    try {
      await employeeRepository.archiveEmployee(archiveTarget.id);
      setArchiveTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法更新员工状态。");
    } finally {
      setArchiveUpdating(false);
    }
  };
  const promote = async () => {
    if (!promotingEmployee) return;
    setPromoting(true);
    try {
      await employeeRepository.promoteToRegular(promotingEmployee.id);
      setFeedback(`${promotingEmployee.displayName} 已转为正式员工。`);
      setPromotingEmployee(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "无法将员工转为正式员工。",
      );
    } finally {
      setPromoting(false);
    }
  };

  if (loading && data.items.length === 0)
    return <LoadingState label="正在加载员工档案..." />;
  if (error) return <ErrorState title="员工管理暂不可用" description={error} />;
  return (
    <PageContainer>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-signal-teal">员工档案</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-graphite-950">
            员工管理
          </h1>
          <p className="mt-2 text-sm text-graphite-600">
            基础档案、就业资料和受保护的银行税务信息分开维护。
          </p>
        </div>
        {user?.role === "ADMIN" ? <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-graphite-950 px-4 text-sm font-semibold text-white hover:bg-graphite-800"
        >
          <Plus className="h-4 w-4" />
          新增员工
        </button> : null}
      </header>
      {feedback ? (
        <p
          className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {feedback}
        </p>
      ) : null}
      <section className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-graphite-200 sm:grid-cols-2 xl:grid-cols-6">
        <label className="xl:col-span-2">
          <span className="text-sm font-medium text-graphite-700">搜索</span>
          <span className="relative mt-1 block">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-graphite-400" />
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
          placeholder="姓名、员工 ID、门店或岗位"
              className="h-11 w-full rounded-xl border border-graphite-200 pl-9 pr-3 text-sm"
            />
          </span>
        </label>
        <Filter
          label="岗位"
          value={filters.jobId}
          onChange={(value) => setFilters({ ...filters, jobId: value })}
          options={[
            { value: "all", label: "全部岗位" },
            { value: "unassigned", label: "未设置岗位" },
            ...jobs.filter((job) => job.isActive).map((job) => ({ value: job.id, label: `${stores.find((store) => store.id === job.storeId)?.name ?? job.storeId} · ${job.name}` })),
          ]}
        />
        <Filter
          label="门店"
          value={filters.storeId}
          onChange={(value) => setFilters({ ...filters, storeId: value, jobId: "all" })}
          options={[
            { value: "all", label: "全部门店" },
            ...stores.map((store) => ({ value: store.id, label: store.name })),
          ]}
        />
        <Filter
          label="员工类型"
          value={filters.employeeType}
          onChange={(value) => setFilters({ ...filters, employeeType: value })}
          options={[
            { value: "all", label: "全部" },
            { value: "REGULAR", label: "正式" },
            { value: "TRAINING", label: "培训" },
          ]}
        />
        <Filter
          label="状态"
          value={filters.status}
          onChange={(value) => setFilters({ ...filters, status: value })}
          options={[
            { value: "Active", label: "在职" },
            { value: "Archived", label: "已归档" },
            { value: "all", label: "全部" },
          ]}
        />
      </section>
      {data.items.length ? (
        <EmployeeList
          employees={data.items}
          stores={stores}
          location={location}
          onEdit={openEdit}
          onArchive={changeArchive}
          onPromote={setPromotingEmployee}
          isAdmin={user?.role === "ADMIN"}
        />
      ) : (
        <EmptyState
          icon={UsersRound}
          title="没有匹配的员工"
          description="请调整搜索或筛选条件。"
        />
      )}
      <div className="flex items-center justify-between text-sm text-graphite-600">
        <span>共 {data.total} 位员工</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
            className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
      {formOpen && user?.role === "ADMIN" ? (
        <EmployeeProfileDialog
          form={form}
          stores={stores}
          editing={editing}
          saving={saving}
          profileLoading={profileLoading}
          profileLoaded={profileLoaded}
          error={formError}
          onChange={setForm}
          onClose={() => setFormOpen(false)}
          onSave={save}
          jobs={jobs}
          onCreateJob={async (storeId, payload) => {
            const created = await employeeRepository.createStoreJob(storeId, payload);
            setJobs((current) => [...current, created].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)));
            setFeedback("岗位已创建。");
            return created;
          }}
          onUpdateJob={async (jobId, payload) => {
            const updated = await employeeRepository.updateStoreJob(jobId, payload);
            setJobs((current) => current.map((job) => job.id === jobId ? updated : job));
            setFeedback(payload.isActive === false ? "岗位已停用。" : "岗位已更新。");
            return updated;
          }}
        />
      ) : null}
      {promotingEmployee ? (
        <Dialog
          titleId="promote-employee-title"
          onClose={() => setPromotingEmployee(null)}
          closeDisabled={promoting}
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        >
          <h2
            id="promote-employee-title"
            className="text-xl font-semibold text-graphite-950"
          >
            转为正式员工？
          </h2>
          <p className="mt-3 text-sm leading-6 text-graphite-600">
            转正后，该员工之后创建的新评价将使用正式员工评分标准。历史培训期评价不会改变。
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={promoting}
              onClick={() => setPromotingEmployee(null)}
              className="h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700"
            >
              取消
            </button>
            <button
              type="button"
              disabled={promoting}
              onClick={() => void promote()}
              className="h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {promoting ? "正在转正" : "确认转正"}
            </button>
          </div>
        </Dialog>
      ) : null}
      {archiveTarget ? (
        <Dialog
          titleId="archive-employee-title"
          onClose={() => setArchiveTarget(null)}
          closeDisabled={archiveUpdating}
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        >
          <h2 id="archive-employee-title" className="text-xl font-semibold text-graphite-950">
            归档员工？
          </h2>
          <p className="mt-3 text-sm leading-6 text-graphite-600">
            归档 {archiveTarget.displayName} 后将不能创建新评分，历史评价仍会保留。
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={archiveUpdating} onClick={() => setArchiveTarget(null)} className="h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700">
              取消
            </button>
            <button type="button" disabled={archiveUpdating} onClick={() => void confirmArchive()} className="h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {archiveUpdating ? "正在归档" : "确认归档"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}

function EmployeeList({
  employees,
  stores,
  location,
  onEdit,
  onArchive,
  onPromote,
  isAdmin,
}: {
  employees: Employee[];
  stores: Store[];
  location: ReturnType<typeof useLocation>;
  onEdit: (employee: Employee) => void;
  onArchive: (employee: Employee) => void;
  onPromote: (employee: Employee) => void;
  isAdmin: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {employees.map((employee) => (
          <article
            key={employee.id}
            className="rounded-xl bg-white p-4 ring-1 ring-graphite-200"
          >
            <div className="flex justify-between gap-3">
              <div>
                <Link
                  to={`/employees/${employee.id}`}
                  className="font-semibold text-graphite-950"
                >
                  {employee.displayName}
                </Link>
                <p className="mt-1 text-xs text-graphite-500">
                  {employee.storeName ??
                    stores.find((s) => s.id === employee.storeId)?.name}
                </p>
              </div>
              <EmployeeStatusBadge status={employee.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <EmployeeTypeBadge employeeType={employee.employeeType} />
              <StoreJobTags jobs={employee.jobs} />
            </div>
            <Actions
              employee={employee}
              location={location}
              onEdit={onEdit}
              onArchive={onArchive}
              onPromote={onPromote}
              isAdmin={isAdmin}
            />
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-graphite-200 lg:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-graphite-50 text-xs text-graphite-600">
            <tr>
              <th className="px-4 py-3">姓名</th>
              <th>员工类型</th>
              <th>岗位</th>
              <th>门店</th>
              <th>状态</th>
              <th className="pr-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-100">
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="px-4 py-4">
                  <Link
                    to={`/employees/${employee.id}`}
                    className="font-semibold text-graphite-950 hover:underline"
                  >
                    {employee.displayName}
                  </Link>
                  <p className="text-xs text-graphite-500">{employee.id}</p>
                </td>
                <td>
                  <EmployeeTypeBadge employeeType={employee.employeeType} />
                </td>
                <td className="py-3 pr-3"><StoreJobTags jobs={employee.jobs} /></td>
                <td>{employee.storeName}</td>
                <td>
                  <EmployeeStatusBadge status={employee.status} />
                </td>
                <td className="pr-4">
                  <Actions
                    employee={employee}
                    location={location}
                    onEdit={onEdit}
                    onArchive={onArchive}
                    onPromote={onPromote}
                    compact
                    isAdmin={isAdmin}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Actions({
  employee,
  location,
  onEdit,
  onArchive,
  onPromote,
  compact = false,
  isAdmin,
}: {
  employee: Employee;
  location: ReturnType<typeof useLocation>;
  onEdit: (employee: Employee) => void;
  onArchive: (employee: Employee) => void;
  onPromote: (employee: Employee) => void;
  compact?: boolean;
  isAdmin: boolean;
}) {
  const target = withEvaluationNavigation(
    `/employees/${employee.id}/evaluation/v1/new`,
    location,
    "employee-management",
  );
  return (
    <div
      className={`flex flex-wrap justify-end gap-2 ${compact ? "" : "mt-4"}`}
    >
      {employee.status === "Active" ? (
        <Link
          to={target.to}
          state={target.state}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-graphite-950 px-3 text-xs font-semibold text-white hover:bg-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500"
        >
          <FilePenLine className="h-3.5 w-3.5" />
          {employee.evaluationCount ? "再次评分" : "评分"}
        </Link>
      ) : null}
      {isAdmin && employee.status === "Active" && employee.employeeType === "TRAINING" ? (
        <button
          type="button"
          onClick={() => onPromote(employee)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-900"
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
          转为正式员工
        </button>
      ) : null}
      {isAdmin ? <button
        type="button"
        onClick={() => void onEdit(employee)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-graphite-100 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500"
      >
        <Pencil className="h-3.5 w-3.5" />
        编辑
      </button> : null}
      {isAdmin ? <button
        type="button"
        onClick={() => void onArchive(employee)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite-200 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500"
      >
        {employee.status === "Archived" ? (
          <RotateCcw className="h-3.5 w-3.5" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
        {employee.status === "Archived" ? "恢复" : "归档"}
      </button> : null}
    </div>
  );
}

function EmployeeProfileDialog({
  form,
  stores,
  editing,
  saving,
  profileLoading,
  profileLoaded,
  error,
  onChange,
  onClose,
  onSave,
  jobs,
  onCreateJob,
  onUpdateJob,
}: {
  form: EmployeeMutationPayload;
  stores: Store[];
  editing: Employee | null;
  saving: boolean;
  profileLoading: boolean;
  profileLoaded: boolean;
  error: string | null;
  onChange: (form: EmployeeMutationPayload) => void;
  onClose: () => void;
  onSave: () => void;
  jobs: StoreJob[];
  onCreateJob: (storeId: string, payload: { name: string; colorToken: StoreJobColorToken; displayOrder: number }) => Promise<StoreJob>;
  onUpdateJob: (jobId: string, payload: Partial<Pick<StoreJob, "name" | "colorToken" | "displayOrder" | "isActive">>) => Promise<StoreJob>;
}) {
  const [tab, setTab] = useState<"basic" | "employment" | "sensitive">("basic");
  const [revealed, setRevealed] = useState(false);
  const set = (key: keyof EmployeeMutationPayload, value: unknown) =>
    onChange({ ...form, [key]: value });
  return (
    <Dialog
      titleId="employee-profile-title"
      onClose={onClose}
      closeDisabled={saving}
      className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
    >
      <header className="flex items-start justify-between border-b border-graphite-200 px-5 py-4">
        <div>
          <h2
            id="employee-profile-title"
            className="text-xl font-semibold text-graphite-950"
          >
            {editing ? "编辑员工档案" : "新增员工"}
          </h2>
          <p className="mt-1 text-sm text-graphite-600">
            工龄由入职日期自动计算。开早、收晚与周清在技能评价中维护。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-graphite-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <nav
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-graphite-200 px-5 pt-3"
        aria-label="员工档案分区"
      >
        {(
          [
            ["basic", "基本资料"],
            ["employment", "就业资料"],
            ["sensitive", "银行与税务"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite-500 ${tab === value ? "border-graphite-950 text-graphite-950" : "border-transparent text-graphite-500"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="overflow-y-auto px-5 py-5">
        <fieldset disabled={!profileLoaded} className="min-w-0 border-0 p-0">
        {tab === "basic" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="显示名称"
              required
              value={form.displayName}
              onChange={(v) => set("displayName", v)}
            />
            <Field
              label="姓"
              value={form.surname}
              onChange={(v) => set("surname", v)}
            />
            <Field
              label="名"
              value={form.givenName}
              onChange={(v) => set("givenName", v)}
            />
            <Field
              label="英文名"
              value={form.englishName}
              onChange={(v) => set("englishName", v)}
            />
            <Choice
              label="性别"
              value={form.gender ?? ""}
              onChange={(v) => set("gender", v || null)}
              options={[
                { value: "", label: "未填写" },
                { value: "MALE", label: "男" },
                { value: "FEMALE", label: "女" },
              ]}
            />
            <Field
              type="date"
              label="出生日期"
              value={form.dateOfBirth}
              onChange={(v) => set("dateOfBirth", v || null)}
            />
            <Choice
              label="员工类型"
              value={form.employeeType}
              disabled={Boolean(editing)}
              onChange={(v) => set("employeeType", v)}
              options={[
                { value: "REGULAR", label: "正式" },
                { value: "TRAINING", label: "培训" },
              ]}
            />
            <Choice
              label="用工类型"
              value={form.employmentType}
              onChange={(v) => set("employmentType", v)}
              options={[
                { value: "Full-time", label: "全职" },
                { value: "Part-time", label: "兼职" },
                { value: "Casual", label: "Casual" },
              ]}
            />
            <Choice
              label="状态"
              value={form.status ?? "Active"}
              onChange={(v) => set("status", v)}
              options={[
                { value: "Active", label: "在职" },
                { value: "Archived", label: "已归档" },
              ]}
            />
            <Field
              type="email"
              label="邮箱"
              value={form.emailAddress}
              onChange={(v) => set("emailAddress", v)}
            />
            <Field
              label="手机号码"
              value={form.mobileTelephoneNumber}
              onChange={(v) => set("mobileTelephoneNumber", v)}
            />
            <Field
              label="Address"
              value={form.addressLine}
              onChange={(v) => set("addressLine", v)}
              className="sm:col-span-2"
            />
            <Field
              label="Suburb"
              value={form.suburb}
              onChange={(v) => set("suburb", v)}
            />
            <Field
              label="State"
              value={form.state}
              onChange={(v) => set("state", v)}
            />
            <Field
              label="Postcode"
              value={form.postcode}
              onChange={(v) => set("postcode", v)}
            />
          </div>
        ) : null}
        {tab === "employment" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="门店"
              value={form.storeId}
              onChange={(v) => onChange({ ...form, storeId: v, jobIds: [] })}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
            />
            <JobAssignmentField
              storeId={form.storeId}
              jobs={jobs.filter((job) => job.storeId === form.storeId)}
              selectedIds={form.jobIds ?? []}
              onChange={(jobIds) => set("jobIds", jobIds)}
              onCreateJob={onCreateJob}
              onUpdateJob={onUpdateJob}
            />
            <Field
              type="date"
              label="入职日期"
              value={form.employmentCommencementDate}
              onChange={(v) => set("employmentCommencementDate", v || null)}
            />
            <div className="rounded-xl bg-graphite-50 p-4 text-sm text-graphite-700 sm:col-span-2">
              工龄：{tenureFromDate(form.employmentCommencementDate)}
            </div>
            <Choice
              label="目前是否持有 Working Holiday Visa？"
              value={
                form.holdsWorkingHolidayVisa == null
                  ? ""
                  : String(form.holdsWorkingHolidayVisa)
              }
              onChange={(v) =>
                set("holdsWorkingHolidayVisa", v === "" ? null : v === "true")
              }
              options={[
                { value: "", label: "未知" },
                { value: "true", label: "是" },
                { value: "false", label: "否" },
              ]}
            />
            <Field
              label="Visa Type"
              value={form.visaType}
              onChange={(v) => set("visaType", v)}
            />
          </div>
        ) : null}
        {tab === "sensitive" ? (
          <div>
            <div className="mb-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                <strong>敏感信息</strong>，仅 ADMIN 可读取和编辑。
              </span>
              <button
                type="button"
                onClick={() => setRevealed(!revealed)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold"
              >
                {revealed ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {revealed ? "隐藏" : "显示"}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SensitiveField
                label="账户名称"
                value={form.bankAccountName}
                onChange={(v) => set("bankAccountName", v)}
                revealed={revealed}
              />
              <SensitiveField
                label="BSB"
                value={form.bsbNumber}
                onChange={(v) => set("bsbNumber", v)}
                revealed={revealed}
              />
              <SensitiveField
                label="银行账号"
                value={form.bankAccountNumber}
                onChange={(v) => set("bankAccountNumber", v)}
                revealed={revealed}
              />
              <SensitiveField
                label="TFN"
                value={form.taxFileNumber}
                onChange={(v) => set("taxFileNumber", v)}
                revealed={revealed}
              />
              <Field
                label="ABN"
                value={form.abn}
                onChange={(v) => set("abn", v)}
              />
              <Field
                label="Super 公司"
                value={form.superannuationCompany}
                onChange={(v) => set("superannuationCompany", v)}
              />
              <SensitiveField
                label="Super 账号"
                value={form.superannuationAccountNumber}
                onChange={(v) => set("superannuationAccountNumber", v)}
                revealed={revealed}
              />
              <Field
                label="USI"
                value={form.uniqueSuperannuationIdentifier}
                onChange={(v) => set("uniqueSuperannuationIdentifier", v)}
              />
            </div>
          </div>
        ) : null}
        </fieldset>
        {profileLoading ? <p className="mt-4 text-sm text-graphite-600" role="status">正在读取员工档案…</p> : null}
        {error ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      <footer className="flex justify-end gap-3 border-t border-graphite-200 px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || profileLoading || !profileLoaded || !form.displayName || !form.storeId}
          className="h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500 disabled:opacity-50"
        >
          {saving ? "正在保存" : "保存档案"}
        </button>
      </footer>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  className = "",
}: {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`text-sm font-medium text-graphite-700 ${className}`}>
      {label}
      {required ? " *" : ""}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-graphite-200 px-3 text-sm text-graphite-950 focus:border-graphite-500 focus:outline-none focus:ring-2 focus:ring-graphite-200"
      />
    </label>
  );
}
function SensitiveField(
  props: Omit<Parameters<typeof Field>[0], "type"> & { revealed: boolean },
) {
  const { revealed, ...field } = props;
  return <Field {...field} type={revealed ? "text" : "password"} />;
}
function Choice({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <AppSelect
      label={label}
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={disabled}
      className="mt-1"
    />
  );
}

function JobAssignmentField({ storeId, jobs, selectedIds, onChange, onCreateJob, onUpdateJob }: {
  storeId: string;
  jobs: StoreJob[];
  selectedIds: string[];
  onChange: (jobIds: string[]) => void;
  onCreateJob: (storeId: string, payload: { name: string; colorToken: StoreJobColorToken; displayOrder: number }) => Promise<StoreJob>;
  onUpdateJob: (jobId: string, payload: Partial<Pick<StoreJob, "name" | "colorToken" | "displayOrder" | "isActive">>) => Promise<StoreJob>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<StoreJobColorToken>("teal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = (jobId: string) => onChange(selectedIds.includes(jobId) ? selectedIds.filter((id) => id !== jobId) : [...selectedIds, jobId]);
  const create = async () => {
    if (!storeId || !name.trim()) return;
    setSaving(true); setError(null);
    try {
      const job = await onCreateJob(storeId, { name: name.trim(), colorToken, displayOrder: jobs.length ? Math.max(...jobs.map((item) => item.displayOrder)) + 10 : 10 });
      onChange([...selectedIds, job.id]); setName(""); setCreating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "岗位创建失败。"); }
    finally { setSaving(false); }
  };
  const saveJob = async () => {
    if (!editingId || !name.trim()) return;
    setSaving(true); setError(null);
    try { await onUpdateJob(editingId, { name: name.trim(), colorToken }); setEditingId(null); setName(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "岗位更新失败。"); }
    finally { setSaving(false); }
  };
  return (
    <fieldset className="space-y-3 rounded-xl border border-graphite-200 p-4 sm:col-span-2">
      <legend className="px-1 text-sm font-semibold text-graphite-800">门店岗位</legend>
      <div className="flex min-h-8 flex-wrap gap-2">
        {selectedIds.length ? selectedIds.map((id) => {
          const job = jobs.find((item) => item.id === id);
          return job ? <button key={id} type="button" onClick={() => toggle(id)} aria-label={`移除岗位 ${job.name}`} className="inline-flex items-center gap-1"><StoreJobTag name={job.name} colorToken={job.colorToken} /><X className="h-3.5 w-3.5" /></button> : null;
        }) : <span className="text-sm text-graphite-500">未设置岗位</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => <div key={job.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-graphite-50 px-3 text-sm"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="checkbox" disabled={!job.isActive && !selectedIds.includes(job.id)} checked={selectedIds.includes(job.id)} onChange={() => toggle(job.id)} /><StoreJobTag name={job.name} colorToken={job.colorToken} />{!job.isActive ? <span className="text-xs text-graphite-500">已停用</span> : null}</label><button type="button" onClick={() => { setEditingId(job.id); setCreating(false); setName(job.name); setColorToken(job.colorToken); }} className="text-xs font-semibold text-graphite-600">编辑</button>{job.isActive ? <button type="button" onClick={() => void onUpdateJob(job.id, { isActive: false })} className="text-xs font-semibold text-red-700">停用</button> : null}</div>)}
      </div>
      {!creating && !editingId ? <button type="button" onClick={() => setCreating(true)} disabled={!storeId} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite-200 px-3 text-sm font-semibold disabled:opacity-50"><Plus className="h-4 w-4" />新建岗位</button> : null}
      {creating || editingId ? (
        <div className="grid gap-3 rounded-lg bg-graphite-50 p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <Field label="岗位名称" value={name} onChange={setName} />
          <Choice label="颜色" value={colorToken} onChange={(value) => setColorToken(value as StoreJobColorToken)} options={[{value:"teal",label:"青色"},{value:"violet",label:"紫色"},{value:"rose",label:"玫红"},{value:"amber",label:"琥珀"},{value:"blue",label:"蓝色"},{value:"slate",label:"灰色"}]} />
          <div className="flex gap-2"><button type="button" onClick={() => { setCreating(false); setEditingId(null); setName(""); }} className="min-h-11 px-3 text-sm">取消</button><button type="button" onClick={() => void (editingId ? saveJob() : create())} disabled={saving || !name.trim()} className="min-h-11 rounded-lg bg-graphite-950 px-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "正在保存" : editingId ? "保存岗位" : "创建并分配"}</button></div>
          {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-3">{error}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
function Filter(props: Parameters<typeof Choice>[0]) {
  return <Choice {...props} />;
}
function profileToForm(
  profile: EmployeeSensitiveProfile,
): EmployeeMutationPayload {
  const form = { ...profile } as EmployeeMutationPayload &
    Record<string, unknown>;
  form.jobIds = profile.jobs.map((job) => job.id);
  for (const key of [
    "id",
    "storeName",
    "tenureMonths",
    "evaluationCount",
    "createdAt",
    "updatedAt",
    "archivedAt",
    "legalName",
    "jobs",
  ])
    delete form[key];
  return form;
}
function tenureLabel(months: number | null) {
  if (months == null) return "工龄未计算";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years ? `${years}年${rest ? `${rest}个月` : ""}` : `${rest}个月`;
}
function tenureFromDate(value?: string | null) {
  if (!value) return "填写入职日期后自动计算";
  const start = new Date(`${value}T00:00:00`);
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    now.getMonth() -
    start.getMonth();
  if (now.getDate() < start.getDate()) months--;
  return tenureLabel(Math.max(0, months));
}
