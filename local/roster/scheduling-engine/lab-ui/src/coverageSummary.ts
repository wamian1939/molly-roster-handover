export type StaffingSlot = {
  start?:string
  required:number
  effective:number
  gap:number
  role_required?:Record<string,number>
  role_effective?:Record<string,number>
}

export function roleShortages(slot:StaffingSlot):[string,number][] {
  return Object.entries(slot.role_required??{})
    .map(([role,required]):[string,number]=>[role,Math.max(0,required-(slot.role_effective?.[role]??0))])
    .filter(([,missing])=>missing>0)
}

export function slotHasGap(slot:StaffingSlot):boolean {
  return slot.gap>0 || roleShortages(slot).length>0
}

export function coveredSlotFraction(slots:StaffingSlot[], diagnostics:{code:string;start?:string}[]=[]):number|null {
  const openingGaps = new Set(diagnostics
    .filter(item=>['OPENING_STAFFING_GAP','OPENING_QUALIFICATION_GAP'].includes(item.code))
    .map(item=>item.start)
    .filter((start):start is string=>Boolean(start)))
  return slots.length ? 1-slots.filter(slot=>slotHasGap(slot)||Boolean(slot.start&&openingGaps.has(slot.start))).length/slots.length : null
}
