import React, { useState } from 'react'

export type EmployeePreference = {
  desired_weekly_minutes: number | null
  hourly_cost_cents: number | null
}

type StaffTarget = {id:string;name:string;employment_type:string|null}
type Props = {
  employees: StaffTarget[]
  preferences: Record<string,EmployeePreference>
  laborCostWeight: number
  onChange: (next:Record<string,EmployeePreference>)=>void
}

const emptyPreference = ():EmployeePreference => ({desired_weekly_minutes:null,hourly_cost_cents:null})

export function EmployeePreferencesEditor({employees,preferences,laborCostWeight,onChange}:Props){
  const [selected,setSelected]=useState('')
  const names=new Map(employees.map(person=>[person.id,person]))
  const available=employees.filter(person=>!(person.id in preferences))
  const update=(id:string,key:keyof EmployeePreference,value:string)=>onChange({...preferences,
    [id]:{...emptyPreference(),...preferences[id],[key]:value===''?null:Number(value)}})
  return <section className="panel">
    <div className="panelTitle"><h2>员工工时偏好与模拟成本</h2><span>优化目标 · 不属于强制合规规则</span></div>
    <p className="help">这里只保存 Lab 的优化输入，不修改 Evaluate 员工资料。每周期望工时按本次求解天数折算；留空时使用平均工时目标。真实员工来源没有小时成本；成本权重大于 0 时，所有候选员工都必须有成本数据，否则求解会报配置错误。</p>
    {laborCostWeight>0&&<p className="notice">当前人工成本权重为 {laborCostWeight}。请为所有可能排班的员工填写每小时成本，或将权重设为 0。</p>}
    <div className="checkRow"><select value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">选择员工</option>{available.map(person=><option value={person.id} key={person.id}>
        {person.name}{person.employment_type?` · ${person.employment_type}`:''}
      </option>)}
    </select><button className="secondary" disabled={!selected} onClick={()=>{
      if(selected){onChange({...preferences,[selected]:emptyPreference()});setSelected('')}
    }}>添加员工偏好</button></div>
    {Object.entries(preferences).map(([id,preference])=><div className="patternCard" key={id}>
      <div className="patternHead"><strong>{names.get(id)?.name??`不在当前员工名单：${id}`}</strong>
        <button className="secondary" onClick={()=>{const next={...preferences};delete next[id];onChange(next)}}>移除</button></div>
      <div className="formGrid">
        <label>每周期望净工时（分钟）<input type="number" min="0" step="15" placeholder="使用平均工时目标"
          value={preference.desired_weekly_minutes??''}
          onChange={event=>update(id,'desired_weekly_minutes',event.target.value)}/></label>
        <label>每小时模拟成本（澳分）<input type="number" min="0" step="1" placeholder="未知"
          value={preference.hourly_cost_cents??''}
          onChange={event=>update(id,'hourly_cost_cents',event.target.value)}/></label>
      </div>
    </div>)}
  </section>
}
