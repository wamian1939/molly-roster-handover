type ShiftSpan = {date:string;start:string;end:string}
type SlotSpan = {date?:string|null;start:string;end:string}

export type DayWindow = {start:number;end:number}
export type VisibleBar = {left:number;width:number;start:number;end:number}

export function localDate(value:string, timezone:string):string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
  }).format(new Date(value))
}

export function coverageDay(slot:SlotSpan, timezone:string):string {
  return slot.date || localDate(slot.start,timezone)
}

export function rangeDays(first:string, last:string):string[] {
  const result:string[]=[]
  for(let value=Date.parse(`${first}T00:00:00Z`);value<=Date.parse(`${last}T00:00:00Z`);value+=86400000){
    result.push(new Date(value).toISOString().slice(0,10))
  }
  return result
}

export function dayWindow(slots:SlotSpan[], day:string, timezone:string):DayWindow|null {
  const selected=slots.filter(slot=>coverageDay(slot,timezone)===day)
  if(!selected.length)return null
  return {start:Math.min(...selected.map(slot=>Date.parse(slot.start))),
    end:Math.max(...selected.map(slot=>Date.parse(slot.end)))}
}

export function shiftsForDay<T extends ShiftSpan>(shifts:T[], slots:SlotSpan[], day:string, timezone:string):T[] {
  const window=dayWindow(slots,day,timezone)
  if(!window)return shifts.filter(shift=>shift.date===day)
  return shifts.filter(shift=>Date.parse(shift.start)<window.end && Date.parse(shift.end)>window.start)
}

export function clippedShift(shift:ShiftSpan, window:DayWindow):VisibleBar|null {
  const start=Math.max(Date.parse(shift.start),window.start)
  const end=Math.min(Date.parse(shift.end),window.end)
  if(end<=start)return null
  const span=window.end-window.start
  return {start,end,left:(start-window.start)/span*100,width:(end-start)/span*100}
}

export function clippedBreak(interval:[string,string], bar:VisibleBar):{left:number;width:number}|null {
  const start=Math.max(Date.parse(interval[0]),bar.start)
  const end=Math.min(Date.parse(interval[1]),bar.end)
  if(end<=start)return null
  const span=bar.end-bar.start
  return {left:(start-bar.start)/span*100,width:(end-start)/span*100}
}
