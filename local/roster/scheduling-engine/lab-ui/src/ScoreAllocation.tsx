export type ScoreAllocationRow = {
  employee_id: string
  employee_name: string
  official_score: number | null
  candidate_shifts: number
  credited_demand_minutes?: number | null
  credited_quality_points?: number | null
}

type ScoreParameters = Record<string, string | number>

export function ScoreAllocation({rows, parameters, objectiveScore}: {
  rows: ScoreAllocationRow[]
  parameters?: ScoreParameters
  objectiveScore?: number | null
}) {
  if (!rows.length) return null
  const v2 = parameters?.model === 'V2_COVERAGE_EXPERIMENT'
  const twoLayer = parameters?.coverage_semantics === 'MIN_EFFECTIVE_WITH_PATTERN_BOUNDS'
  const exactRoster = parameters?.coverage_semantics === 'EXACT_ROSTER_HEADCOUNT'
  const metric = (key:string) => Number(parameters?.[key] ?? 0)
  const stage = String(parameters?.objective_stage ?? '')
  return <section className="panel scoreAllocation">
    <div className="panelTitle"><h2>评分计算与班次选择</h2><span>Evaluate 正式评分快照</span></div>
    {twoLayer ? <p className="help">先处理班型最低数与净在岗最低人数的缺口，再减少偏离目标的人力、额外工时和多余班次，最后比较员工分数、公平性、稳定性与偏好。休息期间不计入净在岗。评分来源没有被改写。</p>
      : <p className="help">{exactRoster?'先满足保存的时段排班人数，再权衡评分和工时。':'先尽量满足人力缺口，再权衡评分和工时。'}只有实际计入需求的工作时段才获得评分收益；无正式评分的员工不虚构分数。</p>}
    {v2 && <>
      <p className="help">{twoLayer?'质量阶段每计入需求的 30 分钟使用正式评分的百分值乘以评分权重；成本启用时以每班四舍五入的澳元计。':'历史模型每计入需求的 30 分钟将正式评分乘以 10，再乘以评分权重。'} 本次阶段：{stage || '未开始'}；评分优化：{parameters?.score_optimization ?? '未知'}。{parameters?.priority_proven===0?'限时求解尚未证明全局最优。':''}</p>
      <div className="scoreFormula">
        <span>{twoLayer?'净在岗最低缺口':'排班人数缺口'}</span><strong>{metric('metric_replayed_gap')} 人·时段</strong>
        {twoLayer&&<><span>班型最低数缺口</span><strong>{metric('metric_pattern_gap')} 班</strong><span>高于目标的人力</span><strong>{metric('metric_target_excess')} 人·时段</strong></>}
        <span>额外在岗惩罚</span><strong>+{metric('metric_excess_penalty')}</strong>
        <span>净工时惩罚</span><strong>+{metric('metric_work_penalty')}</strong>
        <span>班次数惩罚</span><strong>+{metric('metric_shift_penalty')}</strong>
        <span>公平性惩罚</span><strong>+{metric('metric_fairness_penalty')}</strong>
        <span>人工成本惩罚</span><strong>+{metric('metric_cost_penalty')}</strong>
        <span>正式评分收益</span><strong>−{metric('metric_quality_reward')}</strong>
        {twoLayer&&<><span>常规班型收益</span><strong>−{metric('metric_regular_pattern_reward')}</strong><span>提前晚班惩罚</span><strong>+{metric('metric_early_late_start_penalty')}</strong><span>保留原班次收益</span><strong>−{metric('metric_stability_reward')}</strong></>}
        <span>员工班型偏好收益</span><strong>−{metric('metric_pattern_preference_reward')}</strong>
        <span>当前阶段目标值</span><strong>{objectiveScore ?? '—'}</strong>
      </div>
      <p className="help">这些分项属于不同优化阶段，不应相加解释为一个百分制评分。人工成本权重为 0 时，成本项保持关闭。</p>
    </>}
    <div className="scoreAllocationRows">
      {rows.map(row=><div className="scoreAllocationRow" key={row.employee_id}>
        <strong>{row.employee_name}</strong>
        <span>{row.official_score===null?'暂无正式评分':row.official_score.toFixed(1)}</span>
        <span>{row.candidate_shifts} 班</span>
        {v2&&<small>计入需求 {row.credited_demand_minutes??0} 分钟 · 原始评分点数 {row.credited_quality_points??0}</small>}
      </div>)}
    </div>
  </section>
}
