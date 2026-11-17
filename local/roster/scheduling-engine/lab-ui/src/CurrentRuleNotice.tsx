import React from 'react'

export function CurrentRuleNotice({version}:{version:string;mode?:string}) {
  return <p className="comparisonModeNotice" role="note">
    当前规则 {version}。请先检查真实来源，再用这版规则生成候选班表。
  </p>
}
