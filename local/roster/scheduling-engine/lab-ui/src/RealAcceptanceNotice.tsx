type ReviewParameters = Record<string, string | number>

export function RealAcceptanceNotice({parameters, status}: {parameters: ReviewParameters; status?: string}) {
  if (parameters.model === 'V2_COVERAGE_EXPERIMENT') {
    return <div className="realAcceptanceNotice" role="status">
      <strong>真实数据探索排班：先展示可安排班次，缺口单独标记</strong>
      {status === 'FEASIBLE' && parameters.priority_proven === 0 &&
        <span>本次求解在时间限制内找到可行解，但没有证明缺口或最终班表最优。再次点击自动排班会创建新运行，班次可能不同；请按运行编号对照结果。</span>}
      <span>结果按保存的每日班型人数推导时段需求，使用真实可用时间与正式评分。缺口、请假及业务规则仍需经理核对；本结果不会写入正式排班。</span>
    </div>
  }
  if (parameters.pattern_only === 1) {
    return <div className="realAcceptanceNotice" role="status">
      <strong>真实数据候选班表：探索性结果，不可验收或发布</strong>
      <span>此规则只检查每天的班型人数、员工可用时间、岗位资格、已提供的请假和班次冲突。正式使用前仍需另行核查实际业务与适用政策。</span>
    </div>
  }
  const gate = parameters.acceptance_gate
  const label = gate === 'MANUAL_REVIEW_REQUIRED' ? '技术检查通过，仍需人工复核'
    : gate === 'NOT_ELIGIBLE' ? '不可验收或用于发布' : '验收状态未记录，需重新运行并复核'
  return <div className="realAcceptanceNotice" role="status">
    <strong>真实数据候选班表：{label}</strong>
    <span>这是历史规则的运行结果。请查看该次运行的规则存档；求解状态不代表可以发布。</span>
  </div>
}
