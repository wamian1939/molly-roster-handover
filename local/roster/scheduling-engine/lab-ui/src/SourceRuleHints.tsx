import React from 'react'
import type { ObservedShift } from './SourceReference'

export type RosterRuleHints = {
  settings: {
    timezone: string
    openingTime: string
    closingTime: string
    minimumShiftMinutes: number
    defaultBreakMinutes: number
    weeklyHourWarning: number
    dailyHourWarning: number
    version: number
  } | null
  active_templates: {
    name: string
    startTime: string
    endTime: string
    breakMinutes: number
    roleName: string | null
    roleCode: string | null
    version: number
  }[]
}

export function unmatchedPublishedGroups(reference: ObservedShift[], hints: RosterRuleHints) {
  return reference.filter(shift => !hints.active_templates.some(template =>
    !shift.end_next_day && template.startTime === shift.start
    && template.endTime === shift.end && template.breakMinutes === shift.break_minutes))
}

export function SourceRuleHints({hints, reference}: {hints: RosterRuleHints; reference: ObservedShift[]}) {
  const unmatched = unmatchedPublishedGroups(reference, hints)
  return <section className="panel sourceRuleHints">
    <div className="panelTitle"><h2>现有设置与快捷模板</h2><span>只读 · 待核对</span></div>
    <p className="help">这些是 Roster 当前保存的界面设置与快捷模板，不是已批准的人力需求、合法班型或劳动休息政策；不会自动写入 Lab 排班规则。</p>
    {hints.settings ? <p className="help">设置版本 {hints.settings.version} · 门店时区 {hints.settings.timezone} · 记录开门 {hints.settings.openingTime}、关门 {hints.settings.closingTime} · 最短班次输入值 {hints.settings.minimumShiftMinutes} 分钟 · 默认休息输入值 {hints.settings.defaultBreakMinutes} 分钟 · 每日/每周工时提醒 {hints.settings.dailyHourWarning}/{hints.settings.weeklyHourWarning} 小时。提醒值不是法律工时上限。</p>
      : <p className="help">该门店没有已保存的 Roster 设置记录。</p>}
    {hints.active_templates.length ? <div className="referenceRows">{hints.active_templates.map(template =>
      <div className="referenceRow" key={`${template.name}-${template.version}`}>
        <strong>{template.name}</strong><span>{template.startTime}–{template.endTime}</span>
        <span>{template.roleName ?? '未绑定岗位'}</span>
        <span>休息 {template.breakMinutes} 分钟</span><span>版本 {template.version}</span>
      </div>)}</div> : <p className="empty">该门店没有启用的快捷模板。</p>}
    {unmatched.length > 0 && <p className="help">已发布参考中有 {unmatched.length} 组时间与休息时长不匹配当前启用模板（{unmatched.map(shift => `${shift.start}–${shift.end}、休息 ${shift.break_minutes} 分钟`).join('；')}）。模板不能直接当作允许班型。</p>}
  </section>
}
