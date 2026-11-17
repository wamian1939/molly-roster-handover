export function formatClock(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
}
