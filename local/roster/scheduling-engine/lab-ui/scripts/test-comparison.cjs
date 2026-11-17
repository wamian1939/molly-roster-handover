const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'SourceComparison.tsx'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022,
} }).outputText
const localModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, localModule, localModule.exports)
const { comparePublishedToCandidate, summarizeCandidate, summarizeManualCoverage,
  summarizeLaborHours, ManualCoverageBounds, SourceComparison } = localModule.exports

const summarySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'coverageSummary.ts'), 'utf8')
const summaryCompiled = ts.transpileModule(summarySource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const summaryModule = { exports: {} }
new Function('require', 'module', 'exports', summaryCompiled)(require, summaryModule, summaryModule.exports)
const { roleShortages, slotHasGap, coveredSlotFraction } = summaryModule.exports

const publishedDateSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'publishedReferenceDates.ts'), 'utf8')
const publishedDateCompiled = ts.transpileModule(publishedDateSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const publishedDateModule = { exports: {} }
new Function('require', 'module', 'exports', publishedDateCompiled)(require, publishedDateModule, publishedDateModule.exports)
const { missingPublishedDates } = publishedDateModule.exports
assert.deepEqual(missingPublishedDates(['2026-10-26', '2026-10-27'], [{
  date: '2026-10-25', end_instant: '2026-10-25T15:00:00Z',
}], 'Australia/Sydney'), ['2026-10-27'])
assert.deepEqual(missingPublishedDates(['2026-10-26'], [{
  date: '2026-10-25', end_instant: '2026-10-25T13:00:00Z',
}], 'Australia/Sydney'), ['2026-10-26'])
const roleOnlyGap = {required:1,effective:1,gap:0,
  role_required:{manager:1},role_effective:{manager:0}}
assert.deepEqual(roleShortages(roleOnlyGap), [['manager',1]])
assert.equal(slotHasGap(roleOnlyGap), true)
assert.equal(coveredSlotFraction([roleOnlyGap]), 0)
assert.equal(coveredSlotFraction([roleOnlyGap,{required:1,effective:1,gap:0}]), 0.5)
assert.equal(coveredSlotFraction([]), null)
assert.equal(coveredSlotFraction([
  {start:'2026-10-26T02:00:00Z',required:1,effective:1,gap:0},
  {start:'2026-10-26T03:00:00Z',required:1,effective:1,gap:0},
], [
  {code:'OPENING_STAFFING_GAP',start:'2026-10-26T02:00:00Z'},
  {code:'OPENING_QUALIFICATION_GAP',start:'2026-10-26T02:00:00Z'},
  {code:'STAFFING_GAP',start:'2026-10-26T03:00:00Z'},
]),0.5)

function renderNotice(file, exportName, props) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  } }).outputText
  const localModule = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(require, localModule, localModule.exports)
  return renderToStaticMarkup(React.createElement(localModule.exports[exportName], props))
}
const unreviewed = renderNotice('RealAcceptanceNotice.tsx', 'RealAcceptanceNotice', {
  parameters:{acceptance_gate:'NOT_ELIGIBLE',approved_leave_review:'UNKNOWN',
    work_break_policy_review:'UNKNOWN',staffing_rules_review:'UNKNOWN'},
})
assert.ok(unreviewed.includes('不可验收或用于发布'))
assert.ok(unreviewed.includes('历史规则的运行结果'))
const reviewRequired = renderNotice('RealAcceptanceNotice.tsx', 'RealAcceptanceNotice', {
  parameters:{acceptance_gate:'MANUAL_REVIEW_REQUIRED',
    approved_leave_review:'MANUAL_CONFIRMED',work_break_policy_review:'MANUAL_CONFIRMED',
    staffing_rules_review:'MANUAL_CONFIRMED'},
})
assert.ok(reviewRequired.includes('仍需人工复核'))
assert.ok(!reviewRequired.includes('不可验收或用于发布'))
assert.ok(renderNotice('RealAcceptanceNotice.tsx', 'RealAcceptanceNotice', {parameters:{}})
  .includes('验收状态未记录'))
assert.ok(renderNotice('PatternGapNotice.tsx', 'PatternGapNotice', {diagnostics:[{
  date:'2026-10-26',message:'Early requires 4 shifts but only 3 are assigned',
}]}).includes('完整班型人数未满足（1 项）'))

const apiErrorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'apiErrors.ts'), 'utf8')
const apiErrorCompiled = ts.transpileModule(apiErrorSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const apiErrorModule = { exports: {} }
new Function('require', 'module', 'exports', apiErrorCompiled)(require, apiErrorModule, apiErrorModule.exports)
const { apiErrorMessage } = apiErrorModule.exports
assert.equal(apiErrorMessage({detail:[{code:'RULE_CONFIG',message:'Missing manager shift pattern'}]},422),
  'RULE_CONFIG: Missing manager shift pattern')
assert.equal(apiErrorMessage({detail:[
  {code:'RULE_CONFIG',message:'Missing manager shift pattern'},
  {code:'RULE_CONFIG',message:'Missing manager shift pattern'},
]},422),'RULE_CONFIG: Missing manager shift pattern')
assert.equal(apiErrorMessage({detail:[{loc:['body','base_day'],msg:'Invalid rule'}]},422),
  'body.base_day: Invalid rule')
assert.equal(apiErrorMessage({detail:'Store denied'},403),'Store denied')
assert.equal(apiErrorMessage({detail:[{other:'unknown'}]},422),'HTTP 422')

const reference = [{
  date: '2026-10-26', start: '10:00', end: '17:00', end_next_day: false,
  start_instant: '2026-10-25T23:00:00Z', end_instant: '2026-10-26T06:00:00Z',
  role_code: 'service', break_minutes: 0, assigned_people: 2,
}]
const candidate = [
  { start: reference[0].start_instant, end: reference[0].end_instant,
    role_code: 'service', breaks: [] },
  { start: reference[0].start_instant, end: reference[0].end_instant,
    role_code: 'service', breaks: [] },
  { start: '2026-10-26T06:00:00Z', end: '2026-10-26T11:00:00Z',
    role_code: 'service', breaks: [] },
  { start: reference[0].start_instant, end: reference[0].end_instant,
    role_code: 'full-role', breaks: [] },
]
const rows = comparePublishedToCandidate(reference, candidate, 'Australia/Sydney')
assert.equal(rows.length, 3)
assert.deepEqual(rows.map(row => [row.start, row.end, row.role_code,
  row.assigned_people, row.candidate_people]), [
  ['10:00', '17:00', 'full-role', 0, 1],
  ['10:00', '17:00', 'service', 2, 2],
  ['17:00', '22:00', 'service', 0, 1],
])

const dst = [
  { start: '2026-04-04T15:15:00Z', end: '2026-04-04T15:45:00Z',
    role_code: 'service', breaks: [] },
  { start: '2026-04-04T16:15:00Z', end: '2026-04-04T16:45:00Z',
    role_code: 'service', breaks: [] },
]
const repeatedHour = comparePublishedToCandidate([], dst, 'Australia/Sydney')
assert.equal(repeatedHour.length, 2)
assert.deepEqual(repeatedHour.map(row => row.start), ['02:15', '02:15'])
assert.notEqual(repeatedHour[0].start_instant, repeatedHour[1].start_instant)
const html = renderToStaticMarkup(React.createElement(SourceComparison, {
  reference, candidate, timezone: 'Australia/Sydney', snapshotVersion: 'source-v1',
  jobs: [{ id: 'service', name: '服务' }, { id: 'full-role', name: '全岗' }],
  comparisonMode: 'PRESERVE_PUBLISHED',
}))
assert.match(html, /同一次真实来源快照/)
assert.match(html, /人工班次 2 人次，候选班次 4 人次/)
assert.match(html, /本次候选保留目标日期的已发布班次/)
assert.match(html, /来源只记录休息时长/)
assert.match(html, /完整班次排班占用/)
assert.match(html, /人工 14\.0 人时 · 候选 26\.0 人时/)
assert.match(html, /不能据此估算工资成本或节省人力/)
const replacementHtml = renderToStaticMarkup(React.createElement(SourceComparison, {
  reference, candidate, timezone: 'Australia/Sydney', snapshotVersion: 'source-v1',
  jobs: [{ id: 'service', name: '服务' }], comparisonMode: 'REPLACE_TARGET_PUBLISHED',
}))
assert.match(replacementHtml, /本次候选在独立副本中重排目标日期的已发布班次/)
assert.doesNotMatch(replacementHtml, /本次候选保留目标日期的已发布班次/)

const manual = [
  {...reference[0], assigned_people: 5},
  {...reference[0], end: '22:00', end_instant: '2026-10-26T11:00:00Z',
    role_code: 'full-role', break_minutes: 60, assigned_people: 1},
  {...reference[0], start: '17:00', end: '22:00',
    start_instant: '2026-10-26T06:00:00Z', end_instant: '2026-10-26T11:00:00Z',
    assigned_people: 7},
]
const bounds = summarizeManualCoverage(manual)
const halfHourBreak = [['2026-10-26T02:00:00Z', '2026-10-26T02:30:00Z']]
const hourCandidate = [
  ...Array.from({length:3}, () => ({start:reference[0].start_instant,
    end:reference[0].end_instant, breaks:halfHourBreak})),
  ...Array.from({length:2}, () => ({start:'2026-10-26T00:00:00Z',
    end:reference[0].end_instant, breaks:halfHourBreak})),
  ...Array.from({length:4}, () => ({start:'2026-10-26T06:00:00Z',
    end:'2026-10-26T11:00:00Z', breaks:[]})),
]
assert.deepEqual(summarizeLaborHours(manual, hourCandidate), {
  manualGrossMinutes: 82*60, manualBreakMinutes: 60,
  candidateGrossMinutes: 53*60, candidateBreakMinutes: 150,
})
assert.equal(summarizeLaborHours(manual, hourCandidate).candidateGrossMinutes
  - summarizeLaborHours(manual, hourCandidate).candidateBreakMinutes, 50.5*60)
assert.deepEqual(summarizeLaborHours([], dst), {
  manualGrossMinutes: 0, manualBreakMinutes: 0,
  candidateGrossMinutes: 60, candidateBreakMinutes: 0,
})
assert.equal(summarizeLaborHours(manual, [{start:reference[0].start_instant,
  end:reference[0].end_instant, breaks:[['2026-10-26T07:00:00Z',
    '2026-10-26T07:30:00Z']]}]), null)
assert.equal(summarizeLaborHours(manual, [{start:reference[0].start_instant,
  end:reference[0].end_instant, breaks:[['2026-10-26T02:00:00Z',
    '2026-10-26T02:30:00Z'], ['2026-10-26T02:15:00Z',
    '2026-10-26T02:45:00Z']]}]), null)
const hoursHtml = renderToStaticMarkup(React.createElement(SourceComparison, {
  reference: manual, candidate: hourCandidate.map(shift => ({...shift, role_code:'service'})),
  timezone: 'Australia/Sydney', snapshotVersion: 'source-v1', jobs: [],
  comparisonMode: 'REPLACE_TARGET_PUBLISHED',
}))
assert.match(hoursHtml, /人工 82\.0 人时 · 候选 53\.0 人时/)
assert.match(hoursHtml, /人工 81\.0 人时 · 候选 50\.5 人时/)
assert.deepEqual(bounds.map(item => [item.possible_effective_min,
  item.possible_effective_max, item.scheduled]), [[5, 6, 6], [7, 8, 8]])
const boundsHtml = renderToStaticMarkup(React.createElement(ManualCoverageBounds, {
  reference: manual, timezone: 'Australia/Sydney',
}))
assert.match(boundsHtml, /人工班表在岗人数范围/)
assert.match(boundsHtml, /5–6/)
assert.match(boundsHtml, /7–8/)
assert.match(boundsHtml, /不能当作整段同时成立的精确覆盖/)
assert.deepEqual(summarizeManualCoverage([{...reference[0], assigned_people: 2}])
  .map(item => [item.possible_effective_min, item.possible_effective_max]), [[2, 2]])
const separated = summarizeManualCoverage(summarizeCandidate(dst, 'Australia/Sydney'))
assert.equal(separated.length, 3)
assert.deepEqual(separated.map(item => item.scheduled), [1, 0, 1])
assert.equal(separated[1].start_instant, new Date(dst[0].end).toISOString())
assert.equal(separated[1].end_instant, new Date(dst[1].start).toISOString())
const separatedHtml = renderToStaticMarkup(React.createElement(ManualCoverageBounds, {
  reference: summarizeCandidate(dst, 'Australia/Sydney'), timezone: 'Australia/Sydney',
}))
assert.match(separatedHtml, /<td>0<\/td><td>0<\/td>/)

const hintsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'SourceRuleHints.tsx'), 'utf8')
const hintsCompiled = ts.transpileModule(hintsSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022,
} }).outputText
const hintsModule = { exports: {} }
new Function('require', 'module', 'exports', hintsCompiled)(require, hintsModule, hintsModule.exports)
const { unmatchedPublishedGroups, SourceRuleHints } = hintsModule.exports
const hints = {
  settings: {timezone: 'Australia/Sydney', openingTime: '09:00', closingTime: '22:00',
    minimumShiftMinutes: 30, defaultBreakMinutes: 0, weeklyHourWarning: 38,
    dailyHourWarning: 10, version: 3},
  active_templates: [
    {name: 'AA', startTime: '10:00', endTime: '22:00', breakMinutes: 60, version: 1,
      roleName: null, roleCode: null},
    {name: 'BB', startTime: '10:00', endTime: '17:00', breakMinutes: 30, version: 1,
      roleName: null, roleCode: null},
    {name: 'CC', startTime: '16:00', endTime: '22:00', breakMinutes: 0, version: 1,
      roleName: null, roleCode: null},
  ],
}
assert.equal(unmatchedPublishedGroups(manual, hints).length, 2)
const hintsHtml = renderToStaticMarkup(React.createElement(SourceRuleHints, {
  hints, reference: manual,
}))
assert.match(hintsHtml, /现有设置与快捷模板/)
assert.match(hintsHtml, /记录开门 09:00/)
assert.match(hintsHtml, /提醒值不是法律工时上限/)
assert.match(hintsHtml, /已发布参考中有 2 组时间与休息时长不匹配/)
const modeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ComparisonModeControl.tsx'), 'utf8')
const modeCompiled = ts.transpileModule(modeSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022,
} }).outputText
const modeModule = { exports: {} }
new Function('require', 'module', 'exports', modeCompiled)(require, modeModule, modeModule.exports)
const { ComparisonModeControl, ComparisonModeNotice } = modeModule.exports
const controlHtml = renderToStaticMarkup(React.createElement(ComparisonModeControl, {
  enabled: true, onChange: () => {},
}))
assert.match(controlHtml, /type="checkbox" checked=""/)
assert.match(controlHtml, /只读重排对比/)
assert.match(controlHtml, /其他门店、其他日期和锁定班次继续作为约束/)
assert.equal(renderToStaticMarkup(React.createElement(ComparisonModeNotice, {
  mode: 'PRESERVE_PUBLISHED', removed: 0,
})), '')
assert.match(renderToStaticMarkup(React.createElement(ComparisonModeNotice, {
  mode: 'REPLACE_TARGET_PUBLISHED', removed: 2,
})), /排除 2 条目标日期已发布员工班次/)
console.log('Source comparison tests passed')
