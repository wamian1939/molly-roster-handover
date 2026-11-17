import {
  ArrowDownAZ,
  CheckCircle2,
  FilePenLine,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PageContainer } from "../components/layout/PageContainer";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { AppSelect } from "../components/ui/AppSelect";
import { cx, formatScore } from "../lib/format";
import { employmentTypeLabel, skillStatusPresentation } from "../lib/presentation";
import { evaluationRepository } from "../services/evaluationRepository";
import type {
  RosterSkillBoardEmployee,
  RosterSkillBoardResponse,
  RosterSkillBoardSkillDefinition,
  RosterSkillStatus,
  RosterSkillViewMode,
  EmployeeType,
} from "../types/evaluation";
import {
  categoryDisplayNames,
  getCategoryCoverage,
  getEmployeeSkillStatus,
  getKnownSkillCoverage,
  getRosterCellLabel,
  isRosterQualified,
  passesSkillFilters,
  skillStatusLabels,
  skillStatusShortLabels,
} from "../utils/rosterSkillUtils";

type SortKey = "name" | "overallScore" | "skillCoverage" | "speed" | "availability";

export function RosterSkillBoardPage() {
  const { user, selectedStoreId: accountSelectedStoreId } = useAuth();
  const [searchParams] = useSearchParams();
  const storeIdFromRoute = searchParams.get("storeId") ?? "";
  const [data, setData] = useState<RosterSkillBoardResponse | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(storeIdFromRoute || accountSelectedStoreId || "");
  const [viewMode, setViewMode] = useState<RosterSkillViewMode>("roster");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedFullCategory, setSelectedFullCategory] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeType, setEmployeeType] = useState<EmployeeType | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    evaluationRepository.fetchRosterSkillBoard(selectedStoreId || undefined)
      .then((response) => {
        if (isMounted) setData(response);
      })
      .catch((error: unknown) => {
        if (isMounted) setLoadError(error instanceof Error ? error.message : "无法加载排班技能板。");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, [selectedStoreId]);

  useEffect(() => {
    setSelectedStoreId(storeIdFromRoute || accountSelectedStoreId || "");
  }, [accountSelectedStoreId, storeIdFromRoute]);

  const categories = useMemo(
    () => [...new Set(data?.skillDefinitions.map((skill) => skill.category) ?? [])],
    [data],
  );

  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();
    return data.employees
      .filter((employee) => {
        const matchesSearch = !query
          || employee.displayName.toLowerCase().includes(query);
        return matchesSearch
          && (employeeType === "all" || employee.employeeType === employeeType)
          && passesSkillFilters(employee, data.skillDefinitions, selectedSkillIds, selectedFullCategory);
      })
      .sort((left, right) => compareEmployees(left, right, data.skillDefinitions, sortKey));
  }, [data, employeeType, searchQuery, selectedFullCategory, selectedSkillIds, sortKey]);

  if (isLoading && !data) return <LoadingState label="正在加载员工技能总览..." />;
  if (loadError) return <ErrorState title="员工技能总览暂不可用" description={loadError} />;
  if (!data) return <ErrorState title="员工技能总览暂不可用" description="没有返回排班技能数据。" />;

  const groupedSkills = groupSkills(data.skillDefinitions);
  const profileSummary = summarizeProfiles(filteredEmployees, data.skillDefinitions);
  const showStoreSelector = user?.role === "ADMIN" && data.stores.length > 1;

  return (
    <PageContainer>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">员工技能排班总览</p>
          <h1 className="mt-1 text-2xl font-semibold text-graphite-950 sm:text-3xl">排班技能板</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-graphite-600">
            快速查看员工当前技能与操作能力
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-2 shadow-panel ring-1 ring-graphite-200">
          <SummaryMetric label="当前员工" value={filteredEmployees.length.toString()} />
          <SummaryMetric label="水吧全岗" value={profileSummary.fullByCategory.get("Bar")?.toString() ?? "0"} />
          <SummaryMetric label="技能未录" value={profileSummary.unknownProfiles.toString()} />
        </div>
      </section>

      <section className="rounded-lg bg-white p-3 shadow-panel ring-1 ring-graphite-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-graphite-950">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> 筛选
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-5">
          {showStoreSelector ? (
            <AppSelect label="门店" size="compact" value={selectedStoreId} onValueChange={setSelectedStoreId} options={[{ value: "", label: "全部可见门店" }, ...data.stores.map((store) => ({ value: store.id, label: store.name }))]} />
          ) : null}
          <label className="text-sm font-medium text-graphite-700">
            搜索
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="员工姓名或岗位"
                className="app-compact-control w-full rounded-lg border border-graphite-200 bg-white pl-9 pr-3 text-sm font-semibold text-graphite-950 shadow-sm"
              />
            </span>
          </label>
          <AppSelect label="全岗筛选" size="compact" value={selectedFullCategory} onValueChange={setSelectedFullCategory} options={[{ value: "all", label: "不限全岗" }, ...categories.map((category) => ({ value: category, label: `${categoryDisplayNames[category] ?? category}全岗` }))]} />
          <AppSelect label="员工类型" size="compact" value={employeeType} onValueChange={(value) => setEmployeeType(value as EmployeeType | "all")} options={[{ value: "all", label: "全部类型" }, { value: "REGULAR", label: "正式员工" }, { value: "TRAINING", label: "培训员工" }]} />
          <AppSelect label="排序" size="compact" value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)} options={[{ value: "name", label: "姓名" }, { value: "overallScore", label: "综合评分" }, { value: "skillCoverage", label: "岗位覆盖" }, { value: "speed", label: "速度" }, { value: "availability", label: "报班自由度" }]} />
        </div>

        <div className="mt-2 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold text-graphite-500">视图模式</p>
            <div className="mt-1 flex rounded-lg bg-graphite-100 p-1">
              <ModeButton active={viewMode === "roster"} onClick={() => setViewMode("roster")} icon={CheckCircle2} label="排班视图" />
              <ModeButton active={viewMode === "training"} onClick={() => setViewMode("training")} icon={ArrowDownAZ} label="培训视图" />
            </div>
          </div>
          <CheckboxGroup
            label="技能筛选"
            options={data.skillDefinitions.map((skill) => ({ id: skill.id, label: displaySkillName(skill) }))}
            values={selectedSkillIds}
            onChange={setSelectedSkillIds}
          />
        </div>
      </section>

      <CompactCategorySummary employees={filteredEmployees} skills={data.skillDefinitions} categories={categories} />

      <RosterMatrix
        employees={filteredEmployees}
        skills={data.skillDefinitions}
        groupedSkills={groupedSkills}
        viewMode={viewMode}
      />
    </PageContainer>
  );
}

function RosterMatrix({
  employees,
  skills,
  groupedSkills,
  viewMode,
}: {
  employees: RosterSkillBoardEmployee[];
  skills: RosterSkillBoardSkillDefinition[];
  groupedSkills: Array<[string, RosterSkillBoardSkillDefinition[]]>;
  viewMode: RosterSkillViewMode;
}) {
  const reduce = useReducedMotion();
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);
  const useRichRowMotion = !reduce && employees.length <= 100;
  if (employees.length === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center shadow-panel ring-1 ring-graphite-200">
        <UsersRound className="mx-auto h-8 w-8 text-graphite-400" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold text-graphite-950">没有符合筛选条件的员工</h2>
        <p className="mt-2 text-sm text-graphite-600">调整技能、操作能力、门店或搜索条件。</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {employees.map((employee) => (
          <motion.div key={employee.employeeId} layout={useRichRowMotion ? "position" : false} initial={useRichRowMotion ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}><MobileEmployeeCard employee={employee} skills={skills} /></motion.div>
        ))}
      </div>
      <div className="hidden rounded-lg bg-white shadow-panel ring-1 ring-graphite-200 lg:block">
        <div className="skill-board-scroll">
          <table className="w-full min-w-[1240px] table-fixed border-separate border-spacing-0 text-sm" onMouseLeave={() => setHoveredSkillId(null)}>
            <colgroup>
              <col className="w-52" />
              <col className="w-24" />
              {groupedSkills.flatMap(([, categorySkills]) =>
                categorySkills.map((skill) => <col key={skill.id} className="w-[72px]" />),
              )}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 w-52 border-b border-r border-graphite-200 bg-graphite-50 px-3 py-2 text-left text-xs font-semibold text-graphite-500">员工</th>
                <th rowSpan={2} className="sticky left-52 z-20 w-24 border-b border-r border-graphite-200 bg-graphite-50 px-2 py-2 text-left text-xs font-semibold text-graphite-500">综合评分</th>
                {groupedSkills.map(([category, categorySkills]) => (
                  <th key={category} colSpan={categorySkills.length} className="border-b border-r border-graphite-200 bg-graphite-50 px-2 py-1.5 text-center text-xs font-semibold text-graphite-700">
                    {categoryDisplayNames[category] ?? category}
                  </th>
                ))}
              </tr>
              <tr>
                {groupedSkills.flatMap(([, categorySkills]) =>
                  categorySkills.map((skill) => <MatrixHeader key={skill.id} label={displaySkillName(skill)} highlighted={hoveredSkillId === skill.id} onHover={() => setHoveredSkillId(skill.id)} />),
                )}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <motion.tr key={employee.employeeId} layout={useRichRowMotion ? "position" : false} initial={useRichRowMotion ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="group h-[68px]">
                  <td className="sticky left-0 z-[5] border-b border-r border-graphite-100 bg-white px-3 py-1.5 group-hover:bg-blue-50">
                    <EmployeeIdentity employee={employee} skills={skills} />
                  </td>
                  <td className="sticky left-52 z-[4] border-b border-r border-graphite-100 bg-white px-2 py-1.5 align-middle group-hover:bg-blue-50">
                    <ScoreBlock employee={employee} />
                  </td>
                  {groupedSkills.flatMap(([, categorySkills]) =>
                    categorySkills.map((skill) => (
                      <SkillCell
                        key={`${employee.employeeId}-${skill.id}`}
                        status={getEmployeeSkillStatus(employee, skill.id)}
                        viewMode={viewMode}
                        highlighted={hoveredSkillId === skill.id}
                        onHover={() => setHoveredSkillId(skill.id)}
                      />
                    )),
                  )}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function EmployeeIdentity({ employee, skills }: { employee: RosterSkillBoardEmployee; skills: RosterSkillBoardSkillDefinition[] }) {
  const coverage = getKnownSkillCoverage(employee, skills);
  const latest = employee.latestEvaluation;
  const coverageLabel = coverage.unknown > 0
    ? coverage.known === 0
      ? `${coverage.unknown} 项未确认`
      : `${coverage.qualified}/${coverage.known} 可排 · ${coverage.unknown} 未确认`
    : `${coverage.qualified}/${coverage.total} 岗位`;
  const categoryLabel = getCategoryCoverage(employee, skills)
    .map((coverageItem) => `${categoryDisplayNames[coverageItem.category] ?? coverageItem.category} ${coverageItem.qualified}/${coverageItem.total}`)
    .join(" · ");
  return (
    <div title={`${employmentTypeLabel(employee.employmentType)} / ${categoryLabel}`}>
      <Link to={`/employees/${employee.employeeId}`} className="block truncate text-sm font-semibold text-graphite-950 hover:text-blue-700 hover:underline">
        {employee.displayName}
      </Link>
      <div className="mt-1"><EmployeeTypeBadge employeeType={employee.employeeType} /></div>
      <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-graphite-700">
        {latest?.overallScore == null ? "未评分" : `${latest.tier ?? "未分层"} · ${formatScore(latest.overallScore)}`}
        <span className="font-medium text-graphite-500"> · {coverageLabel}</span>
      </p>
    </div>
  );
}

function ScoreBlock({ employee }: { employee: RosterSkillBoardEmployee }) {
  const latest = employee.latestEvaluation;
  return (
    <div
      className="w-24"
      title={latest ? `速度 ${ratingLabel(latest.speedRating)} / 报班自由度 ${ratingLabel(latest.availabilityRating)}` : undefined}
    >
      {latest?.overallScore == null ? (
        <p className="text-xs font-semibold text-graphite-500">未评分</p>
      ) : (
        <>
          <p className="text-sm font-semibold tabular-nums text-graphite-950">
            {formatScore(latest.overallScore)} <span className="text-[11px] text-graphite-500">{latest.tier ?? "未分层"}</span>
          </p>
        </>
      )}
      <Link
        to={newEvaluationPath(employee.employeeId)}
        className="mt-0.5 inline-flex h-5 items-center gap-1 rounded bg-graphite-950 px-1.5 text-[10px] font-semibold text-white hover:bg-graphite-800"
      >
        <FilePenLine className="h-3 w-3" aria-hidden="true" />
        {employee.latestEvaluation ? "再次评分" : "去评分"}
      </Link>
    </div>
  );
}

function SkillCell({ status, viewMode, highlighted, onHover }: { status: RosterSkillStatus | "Unknown"; viewMode: RosterSkillViewMode; highlighted: boolean; onHover: () => void }) {
  const rosterQualified = isRosterQualified(status);
  const label = getRosterCellLabel(status, viewMode);
  return (
    <td onMouseEnter={onHover} className={cx("w-[72px] border-b border-r border-graphite-100 px-1 py-1.5 text-center align-middle transition-colors duration-150", highlighted ? "bg-teal-50/70" : "group-hover:bg-blue-50/70")}>
      <span
        title={skillStatusLabels[status]}
        aria-label={`${label}: ${skillStatusLabels[status]}`}
        className={cx(
          "inline-flex h-6 min-w-9 items-center justify-center rounded px-1.5 text-[11px] font-bold ring-1",
          viewMode === "roster"
            ? rosterQualified
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
              : status === "Unknown"
                ? "bg-white text-graphite-500 ring-graphite-200"
                : "bg-graphite-100 text-graphite-500 ring-graphite-200"
            : skillStatusPresentation[status].compactStyle,
        )}
      >
        {viewMode === "roster" ? (rosterQualified ? "✓" : status === "Unknown" ? "?" : "—") : skillStatusShortLabels[status]}
      </span>
    </td>
  );
}

function MobileEmployeeCard({ employee, skills }: { employee: RosterSkillBoardEmployee; skills: RosterSkillBoardSkillDefinition[] }) {
  const categories = getCategoryCoverage(employee, skills);
  return (
    <article className="rounded-lg bg-white p-4 shadow-panel ring-1 ring-graphite-200">
      <div className="flex items-start justify-between gap-3">
        <EmployeeIdentity employee={employee} skills={skills} />
        <div className="text-right">
          <p className="text-sm font-semibold text-graphite-950">
            {employee.latestEvaluation?.overallScore == null ? "未评分" : formatScore(employee.latestEvaluation.overallScore)}
          </p>
          <p className="mt-1 text-xs font-semibold text-graphite-500">{employee.latestEvaluation?.tier ?? ""}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {categories.map((category) => (
          <SummaryMetric
            key={category.category}
            label={categoryDisplayNames[category.category] ?? category.category}
            value={`${category.qualified}/${category.total}`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold">
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-blue-700">查看技能明细</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {skills.map((skill) => {
            const status = getEmployeeSkillStatus(employee, skill.id);
            return (
              <div key={skill.id} className="rounded-lg bg-graphite-50 p-2">
                <p className="text-xs font-semibold text-graphite-600">{displaySkillName(skill)}</p>
                <p className="mt-1 text-sm font-semibold text-graphite-950">{skillStatusLabels[status]}</p>
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}

function CompactCategorySummary({
  employees,
  skills,
  categories,
}: {
  employees: RosterSkillBoardEmployee[];
  skills: RosterSkillBoardSkillDefinition[];
  categories: string[];
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-panel ring-1 ring-graphite-200">
      <div className="grid grid-cols-2 gap-px bg-graphite-100 text-xs text-graphite-600 xl:grid-cols-4">
      {categories.map((category) => {
        const categorySkills = skills.filter((skill) => skill.category === category);
        const fullCount = employees.filter((employee) =>
          getCategoryCoverage(employee, categorySkills).some((coverage) => coverage.category === category && coverage.isFull),
        ).length;
        const qualifiedSlots = employees.reduce((sum, employee) => {
          const coverage = getCategoryCoverage(employee, categorySkills)[0];
          return sum + (coverage?.qualified ?? 0);
        }, 0);
        return (
          <div key={category} className="min-w-0 bg-white px-3 py-2 font-medium">
            <span className="font-semibold text-graphite-950">{categoryDisplayNames[category] ?? category}</span>
            <span className="ml-2 whitespace-nowrap">全岗 {fullCount} 人 · 可排 {qualifiedSlots} 格</span>
          </div>
        );
      })}
      </div>
    </section>
  );
}

function CheckboxGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold text-graphite-500">{label}</legend>
      <div className="mt-1 flex max-w-4xl flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = values.includes(option.id);
          return (
            <motion.label
              key={option.id}
              className={cx(
        "app-compact-control inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ring-1 transition",
                checked
                  ? "bg-graphite-950 text-white ring-graphite-950"
                  : "bg-white text-graphite-700 ring-graphite-200 hover:bg-graphite-50",
              )}
              whileTap={{ scale: 0.96 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  onChange(event.target.checked
                    ? [...values, option.id]
                    : values.filter((value) => value !== option.id));
                }}
                className="sr-only"
              />
              {option.label}
            </motion.label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: typeof CheckCircle2;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cx(
        "app-compact-control relative inline-flex items-center gap-1.5 overflow-hidden rounded-md px-2.5 text-xs font-semibold transition-colors",
        active ? "text-graphite-950" : "text-graphite-600 hover:text-graphite-950",
      )}
    >
      {active ? <motion.span layoutId="roster-view-mode" className="absolute inset-0 rounded-md bg-white shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
      <Icon className="relative z-[1] h-3.5 w-3.5" aria-hidden="true" />
      <span className="relative z-[1]">{label}</span>
    </motion.button>
  );
}

function MatrixHeader({ label, highlighted = false, onHover }: { label: string; highlighted?: boolean; onHover?: () => void }) {
  return <th onMouseEnter={onHover} className={cx("w-[72px] border-b border-r border-graphite-200 px-1 py-2 text-center text-xs font-semibold text-graphite-600 transition-colors duration-150", highlighted ? "bg-teal-100/80 text-teal-900" : "bg-graphite-50")}>{label}</th>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-graphite-50 px-3 py-2">
      <p className="text-xs text-graphite-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-graphite-950">{value}</p>
    </div>
  );
}

function groupSkills(skills: RosterSkillBoardSkillDefinition[]) {
  const grouped = new Map<string, RosterSkillBoardSkillDefinition[]>();
  skills.forEach((skill) => grouped.set(skill.category, [...(grouped.get(skill.category) ?? []), skill]));
  return [...grouped.entries()];
}

function summarizeProfiles(employees: RosterSkillBoardEmployee[], skills: RosterSkillBoardSkillDefinition[]) {
  const fullByCategory = new Map<string, number>();
  let unknownProfiles = 0;
  employees.forEach((employee) => {
    const known = getKnownSkillCoverage(employee, skills);
    if (known.unknown > 0) unknownProfiles += 1;
    getCategoryCoverage(employee, skills).forEach((coverage) => {
      if (coverage.isFull) fullByCategory.set(coverage.category, (fullByCategory.get(coverage.category) ?? 0) + 1);
    });
  });
  return { fullByCategory, unknownProfiles };
}

function compareEmployees(
  left: RosterSkillBoardEmployee,
  right: RosterSkillBoardEmployee,
  skills: RosterSkillBoardSkillDefinition[],
  sortKey: SortKey,
) {
  const leftName = left.displayName;
  const rightName = right.displayName;
  if (sortKey === "name") return leftName.localeCompare(rightName);
  if (sortKey === "overallScore") return compareNullableDesc(left.latestEvaluation?.overallScore, right.latestEvaluation?.overallScore) || leftName.localeCompare(rightName);
  if (sortKey === "speed") return compareNullableDesc(left.latestEvaluation?.speedRating, right.latestEvaluation?.speedRating) || leftName.localeCompare(rightName);
  if (sortKey === "availability") return compareNullableDesc(left.latestEvaluation?.availabilityRating, right.latestEvaluation?.availabilityRating) || leftName.localeCompare(rightName);
  const leftCoverage = getKnownSkillCoverage(left, skills).ratio;
  const rightCoverage = getKnownSkillCoverage(right, skills).ratio;
  return compareNullableDesc(leftCoverage, rightCoverage) || leftName.localeCompare(rightName);
}

function compareNullableDesc(left: number | null | undefined, right: number | null | undefined) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

function displaySkillName(skill: RosterSkillBoardSkillDefinition) {
  return skillNameByCode[skill.code] ?? skill.nameZh ?? skill.nameEn;
}

const skillNameByCode: Record<string, string> = {
  "tea-preparation": "开茶",
  "milk-bar": "奶吧",
  "cup-labeling": "贴杯",
  "order-scanning": "扫码",
  "ice-station": "加冰",
  "cup-finishing": "炫杯",
  handoff: "中转",
  "delivery-packing": "外卖打包",
  "drink-handoff": "出杯",
  "order-taking": "点单",
};

function ratingLabel(value: number | null) {
  return value == null ? "未录入" : `${value} / 5`;
}

function newEvaluationPath(employeeId: string) {
  return `/employees/${employeeId}/evaluation/v1/new`;
}
