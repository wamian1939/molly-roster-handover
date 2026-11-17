import { ArrowRight, Database, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function FoundationPage({ title, description }: { title: string; description: string }) {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-col gap-4 border-b border-graphite-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-brand-700">{user?.stores.map((store) => store.name).join("、") || "全部门店"}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-graphite-950">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-600">{description}</p></div>
        <Link to="/calendar" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-graphite-950 px-4 text-sm font-semibold text-white hover:bg-graphite-800">返回排班日历<ArrowRight className="h-4 w-4" /></Link>
      </header>
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_.85fr]">
        <div className="rounded-2xl border border-graphite-200 bg-white p-6 shadow-panel"><h2 className="text-lg font-semibold text-graphite-950">基础连接已建立</h2><dl className="mt-5 grid gap-4 sm:grid-cols-3"><Status icon={ShieldCheck} label="身份" value="Evaluate 会话" /><Status icon={Database} label="排班数据" value="独立数据库" /><Status icon={UsersRound} label="员工资料" value="只读集成" /></dl></div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6"><h2 className="font-semibold text-brand-900">当前阶段</h2><p className="mt-2 text-sm leading-6 text-brand-900/80">日历、班次和员工选择功能正在按主合同的阶段顺序实现。</p></div>
      </section>
    </div>
  );
}

function Status({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return <div><Icon className="h-5 w-5 text-brand-700" /><dt className="mt-3 text-xs font-semibold text-graphite-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-graphite-950">{value}</dd></div>;
}

