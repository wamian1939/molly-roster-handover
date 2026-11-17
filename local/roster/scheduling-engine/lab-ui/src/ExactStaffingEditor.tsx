import './ExactStaffingEditor.css'

export type ExactBand = {start:string;end:string;staff:number}

const days = ['周一','周二','周三','周四','周五','周六','周日']
const slots = [
  {start:'10:00',end:'11:00',label:'开早准备'},
  {start:'11:00',end:'17:00',label:'白天'},
  {start:'17:00',end:'22:00',label:'晚上'},
]

export function ExactStaffingEditor({weekly,onChange}:{
  weekly:Record<string,ExactBand[]>
  onChange:(value:Record<string,ExactBand[]>)=>void
}) {
  const change = (day:number,index:number,value:string) => {
    const count = Number(value)
    if (!Number.isInteger(count) || count < 0) return
    const key=String(day)
    const bands=slots.map((slot,slotIndex)=>({
      start:slot.start,end:slot.end,
      staff:slotIndex===index?count:weekly[key]?.[slotIndex]?.staff??0,
    }))
    onChange({...weekly,[key]:bands})
  }
  return <section className="panel exactStaffing">
    <div className="panelTitle"><h2>每天精确排班人数</h2><span>一个设置，七天分别填写</span></div>
    <p className="help">填写的是该时段安排的总人数。Full 覆盖白天和晚上，在两个时段各计 1 人；10:00 开始的 Full 也计入开早准备。休息不改变排班人数，实际在岗人数会单独显示。</p>
    <div className="exactStaffingGrid">{days.map((label,day)=><div className="exactStaffingDay" key={day}>
      <strong>{label}</strong>
      {slots.map((slot,index)=><label key={slot.start}>
        <span><b>{slot.label}</b><small>{slot.start}–{slot.end}</small></span>
        <input type="number" min="0" step="1" inputMode="numeric"
          aria-label={`${label} ${slot.label} 精确人数`}
          value={weekly[String(day)]?.[index]?.staff??0}
          onChange={event=>change(day,index,event.target.value)}/>
        <em>人</em>
      </label>)}
    </div>)}</div>
  </section>
}
