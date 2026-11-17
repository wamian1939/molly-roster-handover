import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Building2, Edit3, Plus, RotateCcw, Save, X } from "lucide-react";
import { PageContainer } from "../components/layout/PageContainer";
import { MotionCard } from "../components/motion/MotionCard";
import { MotionList } from "../components/motion/MotionList";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { Dialog } from "../components/ui/Dialog";
import { storeRepository, type StoreMutationPayload, type StoreWithCounts } from "../services/storeRepository";
import type { Store } from "../types/evaluation";

const emptyForm: StoreMutationPayload = {
  id: "",
  name: "",
  region: "",
  managerName: "",
  city: "",
};

export function StoreManagementPage() {
  const [stores, setStores] = useState<StoreWithCounts[]>([]);
  const [form, setForm] = useState<StoreMutationPayload>(emptyForm);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<StoreWithCounts | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const mounted = useRef(false);
  const loadSequence = useRef(0);

  const loadStores = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await storeRepository.fetchStoresForManagement(showArchived);
      if (mounted.current && sequence === loadSequence.current) setStores(result);
    } catch (error) {
      if (mounted.current && sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : "无法加载门店。");
    } finally {
      if (mounted.current && sequence === loadSequence.current) setIsLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    mounted.current = true;
    void loadStores();
    return () => { mounted.current = false; };
  }, [loadStores]);

  const totalEmployees = stores.reduce((sum, store) => sum + store.counts.employees, 0);
  const totalHistory = stores.reduce((sum, store) => sum + store.counts.evaluations, 0);
  const editingStore = useMemo(
    () => stores.find((store) => store.id === editingStoreId) ?? null,
    [editingStoreId, stores],
  );
  const isEditing = Boolean(editingStore);

  function startCreate() {
    setEditingStoreId(null);
    setForm(emptyForm);
    setFeedback(null);
  }

  function startEdit(store: Store) {
    setEditingStoreId(store.id);
    setForm({
      id: store.id,
      name: store.name,
      region: store.region,
      managerName: store.managerName,
      city: store.city,
    });
    setFeedback(null);
  }

  async function saveStore() {
    setIsSaving(true);
    setLoadError(null);
    setFeedback(null);
    try {
      if (isEditing) {
        await storeRepository.updateStore(form.id, {
          name: form.name,
          region: form.region,
          managerName: form.managerName,
          city: form.city,
        });
        setFeedback(`${form.name} 已更新。`);
      } else {
        await storeRepository.createStore(form);
        setFeedback(`${form.name} 已添加。`);
      }
      setForm(emptyForm);
      setEditingStoreId(null);
      await loadStores();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法保存门店。");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStoreArchive(store: StoreWithCounts) {
    if (statusUpdating) return;
    setStatusUpdating(true);
    setLoadError(null);
    setFeedback(null);
    try {
      if (store.isActive) await storeRepository.archiveStore(store.id);
      else await storeRepository.reactivateStore(store.id);
      setArchiveTarget(null);
      setFeedback(store.isActive ? `${store.name} 已停用，全部历史数据保持不变。` : `${store.name} 已重新启用。`);
      if (editingStoreId === store.id) startCreate();
      await loadStores();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法更新门店状态。");
    } finally {
      setStatusUpdating(false);
    }
  }

  if (isLoading && stores.length === 0) {
    return <LoadingState label="正在加载门店..." />;
  }

  return (
    <PageContainer>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-signal-teal">门店管理</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-graphite-950 sm:text-4xl">
            门店
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-600">
            维护员工归属、评分、数据分析和管理权限所使用的门店资料。
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-graphite-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-graphite-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加门店
        </button>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-graphite-700">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          查看已归档门店
        </label>
      </div>

      {feedback ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
          {feedback}
        </div>
      ) : null}
      {loadError ? <ErrorState title="门店操作暂不可用" description={loadError} /> : null}
      <MotionList className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="门店" value={stores.length} detail="已配置门店" />
        <SummaryCard label="员工" value={totalEmployees} detail="全部门店已分配员工" />
        <SummaryCard label="评分记录" value={totalHistory} detail="关联历史记录" />
      </MotionList>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <MotionCard className="overflow-hidden" interactive={false}>
          <div className="border-b border-graphite-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-graphite-950">门店目录</h2>
            <p className="mt-1 text-sm text-graphite-500">编辑门店资料，或在不破坏历史数据的前提下停用门店。</p>
          </div>
          {stores.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] table-fixed divide-y divide-graphite-200/80">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[13%]" />
                  <col className="w-[14%]" />
                  <col className="w-[25%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="bg-graphite-50/80">
                  <tr>
                    <Header label="门店" />
                    <Header label="区域" />
                    <Header label="负责人" />
                    <Header label="关联数据" />
                    <th className="px-5 py-3 text-right text-xs font-semibold text-graphite-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite-100 bg-white">
                  {stores.map((store) => {
                    return (
                      <tr key={store.id} className="transition-colors hover:bg-blue-50/40">
                        <td className="whitespace-nowrap px-5 py-4 align-middle">
                          <p className="text-sm font-semibold text-graphite-950">{store.name}</p>
                          <p className="mt-1 text-xs text-graphite-500">{store.city} / {store.id}</p>
                          <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${store.isActive ? "bg-emerald-50 text-emerald-800" : "bg-graphite-100 text-graphite-700"}`}>
                            {store.isActive ? "启用" : "已归档"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 align-middle text-sm text-graphite-700">{store.region}</td>
                        <td className="whitespace-nowrap px-5 py-4 align-middle text-sm text-graphite-700">{store.managerName}</td>
                        <td className="whitespace-nowrap px-5 py-4 align-middle text-sm text-graphite-700">
                          {store.counts.employees} 名员工 / {store.counts.evaluations} 条评分 / {store.counts.userAccounts} 个账号
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 align-middle text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(store)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-graphite-100 px-3 text-xs font-semibold text-graphite-800 transition hover:bg-graphite-200"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(store)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-graphite-100 px-3 text-xs font-semibold text-graphite-800 transition hover:bg-graphite-200"
                            >
                              {store.isActive ? <Archive className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                              {store.isActive ? "停用门店" : "重新启用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="暂无门店" description="请先添加门店，再分配员工或开始评分。" />
          )}
        </MotionCard>

        <MotionCard className="p-5" interactive={false}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-graphite-950">
                {isEditing ? "编辑门店" : "添加门店"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-graphite-600">
                门店资料会用于评分概览、员工筛选和评分历史。
              </p>
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-graphite-100 text-graphite-700 transition hover:bg-graphite-200"
                aria-label="取消编辑"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            <Field
              label="门店 ID"
              value={form.id}
              onChange={(value) => setForm((current) => ({ ...current, id: toStoreId(value) }))}
              disabled={isEditing}
              placeholder="store-newtown"
            />
            <Field
              label="门店名称"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              placeholder="Newtown Market"
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field
                label="城市"
                value={form.city}
                onChange={(value) => setForm((current) => ({ ...current, city: value }))}
                placeholder="Sydney"
              />
              <Field
                label="区域"
                value={form.region}
                onChange={(value) => setForm((current) => ({ ...current, region: value }))}
                placeholder="Central"
              />
            </div>
            <Field
              label="负责人"
              value={form.managerName}
              onChange={(value) => setForm((current) => ({ ...current, managerName: value }))}
              placeholder="Amelia Chen"
            />
            <button
              type="button"
              onClick={saveStore}
              disabled={isSaving || !isValidStoreForm(form)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-graphite-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-graphite-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSaving ? "保存中..." : isEditing ? "保存门店" : "添加门店"}
            </button>
          </div>
        </MotionCard>
      </section>
      {archiveTarget ? (
        <Dialog titleId="store-status-title" onClose={() => setArchiveTarget(null)} closeDisabled={statusUpdating} className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
          <h2 id="store-status-title" className="text-xl font-semibold text-graphite-950">{archiveTarget.isActive ? `停用 ${archiveTarget.name}？` : `重新启用 ${archiveTarget.name}？`}</h2>
          <p className="mt-3 text-sm leading-6 text-graphite-600">{archiveTarget.isActive ? "该门店的账号授权会被移除；仍有其他门店权限的账号继续使用，只绑定此门店的账号会自动停用。历史员工与已结束评价保持不变。" : "启用后可以再次分配账号、创建员工和发起评分。"}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={statusUpdating} onClick={() => setArchiveTarget(null)} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700 disabled:opacity-50">取消</button>
            <button type="button" disabled={statusUpdating} onClick={() => void toggleStoreArchive(archiveTarget)} className="min-h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{statusUpdating ? "正在更新" : archiveTarget.isActive ? "停用门店" : "重新启用门店"}</button>
          </div>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <MotionCard className="p-5" interactive={false}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-graphite-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-graphite-950">{value}</p>
          <p className="mt-1 text-xs text-graphite-500">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-signal-blue">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </MotionCard>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-graphite-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 block h-11 w-full rounded-xl border border-graphite-200 bg-white px-3 text-sm font-semibold text-graphite-950 shadow-sm placeholder:text-graphite-400 disabled:cursor-not-allowed disabled:bg-graphite-100 disabled:text-graphite-500"
      />
    </label>
  );
}

function Header({ label }: { label: string }) {
  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
      {label}
    </th>
  );
}

function toStoreId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidStoreForm(form: StoreMutationPayload) {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.id) &&
    form.name.trim().length > 0 &&
    form.region.trim().length > 0 &&
    form.managerName.trim().length > 0 &&
    form.city.trim().length > 0
  );
}
