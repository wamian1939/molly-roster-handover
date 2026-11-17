import { CalendarRange, CircleAlert, Copy, Download, MousePointer2, ShieldCheck, UsersRound } from "lucide-react";

const steps = [
  { icon: MousePointer2, title: "拖选创建", text: "在日视图或周视图按住并拖过时间格。松开后核对开始、结束、休息和岗位；取消不会产生任何写入。" },
  { icon: UsersRound, title: "选择员工", text: "员工卡展示 Evaluate Molly 的当前正式评分、Tier、技能分类和本周期工时。时间冲突、技能缺口与可用时间不匹配会明确标记。" },
  { icon: CalendarRange, title: "编辑与批量", text: "点击已保存班次，在表单中修改时间、员工和休息；班次卡片不能拖动。员工行空白日期可直接新建。批量模式可多选后统一改岗或删除；版本过期时系统会要求刷新。" },
  { icon: Copy, title: "复制与调整", text: "可复制一天或一个周期的班次。日历中已保存的班次可随时点击修改或删除，无需发布或重新打开；员工报班、岗位和版本冲突检查仍然生效。" },
  { icon: Download, title: "安全导出", text: "员工安全版只包含工作所需信息。管理版仅限总账号，包含内部备注及排班时的正式评分/Tier 快照。" },
] as const;

export function HelpPage() {
  return <div><header><p className="text-sm font-semibold text-brand-700">Molly Roster 使用指南</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-graphite-950 sm:text-3xl">创建与调整班表</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-600">所有排班数据由 Roster 独立保存；登录、门店范围、员工、技能和正式评分由 Evaluate Molly 管理。</p></header><section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{steps.map((step, index) => <article key={step.title} className="rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><step.icon className="h-5 w-5" /></span><p className="mt-4 text-xs font-semibold text-graphite-400">0{index + 1}</p><h2 className="mt-1 font-semibold text-graphite-950">{step.title}</h2><p className="mt-2 text-sm leading-6 text-graphite-600">{step.text}</p></article>)}</section><section className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="flex items-center gap-2 font-semibold text-amber-950"><CircleAlert className="h-5 w-5" />警告与阻断</h2><p className="mt-2 text-sm leading-6 text-amber-900">技能匹配和工时提示帮助经理判断；已记录不可用时间、时间重叠和停用员工会被服务端拒绝。</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="flex items-center gap-2 font-semibold text-emerald-950"><ShieldCheck className="h-5 w-5" />隐私边界</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Roster 不展示或存储电话、邮箱、住址、生日、薪资、证件信息、评价者明细或 AI 证据。</p></div></section></div>;
}
