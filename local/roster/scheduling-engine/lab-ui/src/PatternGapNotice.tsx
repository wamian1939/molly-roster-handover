type PatternGap = {date?:string; message:string}

export function PatternGapNotice({diagnostics}:{diagnostics:PatternGap[]}) {
  if (diagnostics.length === 0) return null
  return <div className="patternGapNotice" role="alert">
    <strong>完整班型人数未满足（{diagnostics.length} 项）</strong>
    <ul>{diagnostics.map((item,index)=><li key={index}>{item.date ? `${item.date} · ` : ''}{item.message}</li>)}</ul>
  </div>
}
