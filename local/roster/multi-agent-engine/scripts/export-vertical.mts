// Static export of the same vertical ScheduleViews used by CP-SAT. No browser automation.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ScheduleViews} from '../../scheduling-engine/lab-ui/src/ScheduleViews.tsx';
const root=path.resolve(process.cwd());
const folder=path.resolve(process.argv[2]);
const lab=path.resolve(root,'../scheduling-engine/lab-ui');
const requireLab=createRequire(path.join(lab,'package.json'));
const React=requireLab('react');
const {renderToStaticMarkup}=requireLab('react-dom/server');
const result=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.join(folder,'snapshot-scheduling.json'),'utf8'));
const provenance=JSON.parse(fs.readFileSync(path.join(folder,'provenance.json'),'utf8'));
if(result.source!=='REAL'||result.policy.fairness_weight!==0)throw new Error('Actual employees and fairness disabled required');
const people=new Map(snapshot.employees.map(e=>[e.id,e]));
const assignments=result.assignments.map(s=>({...s,employee_name:people.get(s.employee_id).name,breaks:[],reasons:[s.reason]}));
const coverage=result.validation.coverage.map(s=>({...s,effective:s.scheduled,on_break:0,gap:Math.max(0,-s.difference)}));
const h=React.createElement;
const allocation=result.business_rule_report;
const allocationView=allocation?renderToStaticMarkup(h('section',{className:'ma-section'},
 h('h2',{},'评分与报班工时目标'),h('p',{},`规则 ${allocation.rule_version}。目标是软分配比例，精确覆盖、Availability、资格和指定员工晚班是硬条件。`),
 h('div',{className:'ma-scroll'},h('table',{},h('thead',{},h('tr',{},...['员工','正式评分','报班小时','目标比例','目标小时','已排小时','实际比例'].map(t=>h('th',{key:t},t)))),
 h('tbody',{},...allocation.rows.map(r=>h('tr',{key:r.employee_id},h('td',{},r.employee_name),h('td',{},r.rating??'未知'),
 h('td',{},(r.available_minutes/60).toFixed(2)),h('td',{},r.target_fraction!==null?(r.target_fraction*100).toFixed(0)+'%':'未设目标'),
 h('td',{},r.target_scheduled_minutes!==null?(r.target_scheduled_minutes/60).toFixed(2):'—'),h('td',{},(r.target_assigned_minutes/60).toFixed(2)),
 h('td',{},r.actual_fraction!==null?(r.actual_fraction*100).toFixed(1)+'%':'无报班')))))),
 h('h3',{},'指定员工完整晚班'),...allocation.mandatory_coverage.map(r=>h('p',{key:r.date+r.employee_id},
 `${r.date} ${r.employee_name} ${r.start}–${r.end}：${r.satisfied?'已满足':'未满足'}；${r.shifts.map(s=>s.pattern_name+' '+new Date(s.start).toLocaleTimeString('en-AU',{timeZone:snapshot.timezone,hour:'2-digit',minute:'2-digit',hour12:false})+'–'+new Date(s.end).toLocaleTimeString('en-AU',{timeZone:snapshot.timezone,hour:'2-digit',minute:'2-digit',hour12:false})).join('、')}`)))):'';
const heading=renderToStaticMarkup(h('header',{className:'ma-header'},h('div',{},
 h('h1',{},'Hurstville · 真实员工竖版班表'),
 h('p',{},`${result.context.days[0].date} 至 ${result.context.days.at(-1).date} · ${snapshot.employees.length} 名现有员工 · ${snapshot.availability.length} 个可用区间 · ${allocation?'按评分报班比例分配':'公平性关闭'}`),
 h('p',{},`${assignments.length} 个已接受班次，其中 ${assignments.filter(s=>s.pattern_name==='Full').length} 个 Full。未通过日期：${result.failed_days.map(d=>d.date).join('、')||'无'}。${result.validation.valid?'名义覆盖通过，合规待处理。':'全周不可发布。'}`),
 h('p',{},`数据库读取：${new Date(provenance.fetched_at).toLocaleString('zh-CN',{timeZone:snapshot.timezone})}（悉尼）。静态导出，只计算名义覆盖，休息待处理。`))));
const calendar=renderToStaticMarkup(h(ScheduleViews,{assignments,coverage,timezone:snapshot.timezone,
 startDate:result.context.days[0].date,endDate:result.context.days.at(-1).date,week:true,
 selectedDate:result.context.days[0].date,onDateChange:()=>{},onSelect:()=>{},showEffective:false}));
const css=fs.readFileSync(path.join(lab,'src/style.css'),'utf8')+'\n'+fs.readFileSync(path.join(lab,'src/multi-agent/style.css'),'utf8');
const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hurstville 真实员工竖版班表</title><style>'+css+'</style></head><body><div class="ma-app">'+heading+'<main class="ma-main">'+allocationView+calendar+'</main></div></body></html>';
fs.writeFileSync(path.join(folder,'real-roster-vertical.html'),html,'utf8');
const columns=(html.match(/class="verticalShift"/g)||[]).length;
if(columns!==assignments.length||html.includes('synthetic-')||html.includes('Test employee'))throw new Error('Static visual verification failed');
console.log(JSON.stringify({file:path.join(folder,'real-roster-vertical.html'),shift_elements:columns,days:7,source:'REAL',fairness:0}));
