const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadTs(filename) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const localModule = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(require, localModule, localModule.exports)
  return localModule.exports
}
const { formatClock } = loadTs('timeDisplay.ts')
const { rangeDays, coverageDay, shiftsForDay, dayWindow, clippedShift, clippedBreak } =
  loadTs('scheduleViewGeometry.ts')

const instant = '2026-10-26T00:00:00Z'
assert.equal(formatClock(instant, 'Australia/Sydney'), '11:00')
assert.equal(formatClock(instant, 'Australia/Brisbane'), '10:00')
assert.equal(formatClock('2026-10-25T13:00:00Z', 'Australia/Sydney'), '00:00')
const zone = 'Australia/Sydney'
const priorNight = {date:'2026-10-25',start:'2026-10-25T11:00:00Z',end:'2026-10-25T15:00:00Z'}
const selectedDay = '2026-10-26'
const slots = [
  {date:selectedDay,start:'2026-10-25T13:00:00Z',end:'2026-10-25T15:00:00Z'},
  {date:selectedDay,start:'2026-10-25T15:00:00Z',end:'2026-10-25T17:00:00Z'},
]
assert.deepEqual(rangeDays(selectedDay,selectedDay),[selectedDay])
assert.equal(coverageDay({date:selectedDay,start:'2026-10-26T13:00:00Z',end:'2026-10-26T13:30:00Z'},zone),selectedDay)
assert.deepEqual(shiftsForDay([priorNight],slots,selectedDay,zone),[priorNight])
const window = dayWindow(slots,selectedDay,zone)
const bar = clippedShift(priorNight,window)
assert.equal(bar.left,0)
assert.equal(bar.width,50)
assert.equal(clippedBreak(['2026-10-25T12:00:00Z','2026-10-25T12:30:00Z'],bar),null)
console.log('Local time display tests passed')
