type PublishedSpan = {date: string; end_instant: string}

function lastCoveredLocalDate(endInstant: string, timezone: string): string {
  // End is exclusive, so a shift ending exactly at midnight does not cover the next day.
  const lastMoment = new Date(Date.parse(endInstant) - 1)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(lastMoment)
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function missingPublishedDates(days: string[], shifts: PublishedSpan[], timezone: string): string[] {
  const spans = shifts.map(shift => ({start: shift.date,
    end: lastCoveredLocalDate(shift.end_instant, timezone)}))
  return days.filter(day => !spans.some(span => span.start <= day && day <= span.end))
}
