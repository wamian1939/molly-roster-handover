import React from 'react'

export function RunSourceNotice({savedRuleVersion,runRuleVersion,runMode,runId}: {
  savedRuleVersion:string|null;runRuleVersion:string;runMode:string;runId:string
}) {
  return <p className="comparisonModeNotice" role="note">
    当前显示的是运行 {runId}：{runMode==='STRICT'?'严格模式':'尽力模式'}，规则 {runRuleVersion}。
    页面当前保存的规则是 {savedRuleVersion??'未载入'}；上方模式选择只影响下一次求解。
    {savedRuleVersion!==runRuleVersion?' 当前运行是历史规则版本，不能用当前规则解释其班次。':''}
    命令行使用未保存提案和本地快照得到的班表不会自动出现在页面历史中。
  </p>
}
