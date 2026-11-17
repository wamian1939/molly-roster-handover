import {createPayrollRouter} from '../generated/vendor/payroll/routes.ts';
import {PayrollService} from '../generated/vendor/payroll/service.ts';
import {PayrollStore} from '../generated/vendor/payroll/store.ts';
import {XeroClient} from '../generated/vendor/payroll/xero.ts';
import {payrollSources} from '../generated/vendor/payroll/sources.ts';
import {createRouter} from '../generated/vendor/routes.ts';
import {RosterService} from '../generated/vendor/rosterService.ts';
import {EvaluateClient} from './evaluate.mjs';
import {D1SnapshotClient,ConcurrentWrite,metadata} from './snapshot-db.mjs';
import {demo} from './demo.mjs';
import {createHash} from './crypto.mjs';
import {EvaluateSnapshotClient} from './evaluate-db.mjs';
import {createEvaluationRouter} from '../generated/evaluate/routes.ts';
import {configureRuntime} from './runtime-env.mjs';
import {loginSchema} from '../generated/evaluate/validation.ts';
import assets from '../generated/assets.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
async function bodyOf(request){if(['GET','HEAD'].includes(request.method))return undefined;const bytes=await request.arrayBuffer();if(bytes.byteLength>2e6)fail(413,'请求过大');try{return bytes.byteLength?JSON.parse(new TextDecoder().decode(bytes)):{}}catch{fail(400,'请求内容不是有效 JSON')}}
async function migration(request,env,body){const token=env.MIGRATION_TOKEN;if(!token||token.length<32)fail(403,'Migration endpoint disabled');const actual=request.headers.get('authorization')??'';if(hash(actual)!==hash('Bearer '+token))fail(403,'Unauthorized');if(request.method!=='POST')fail(405,'POST required');
 if(new URL(request.url).pathname.endsWith('/verify')){const models=Object.values(metadata);const result=await env.DB.batch([...models.map(m=>env.DB.prepare(`SELECT * FROM "${m.table}"`)),env.DB.prepare('SELECT source_table,record_key,body FROM sites_evaluate_archive ORDER BY source_table,record_key'),env.DB.prepare('SELECT count(*) n FROM sites_accounts'),env.DB.prepare('PRAGMA foreign_key_check'),env.DB.prepare("SELECT id FROM sites_imports WHERE id='complete'")]);return Response.json({rosterCounts:Object.fromEntries(models.map((m,i)=>[m.table,result[i].results.length])),rosterDigests:Object.fromEntries(models.map((m,i)=>[m.table,hash(canonical(result[i].results.map(canonical).sort()))])),evaluateArchiveRows:result[models.length].results.length,evaluateArchiveDigest:hash(canonical(result[models.length].results.map(canonical).sort())),accounts:result[models.length+1].results[0].n,foreignKeyViolations:result[models.length+2].results.length,sealed:result[models.length+3].results.length===1})}
 const done=await env.DB.prepare("SELECT id FROM sites_imports WHERE id='complete'").first();if(done)fail(409,'Migration is sealed');
 const {id,records}=body??{};if(typeof id!=='string'||!/^[a-z0-9_-]{1,80}$/.test(id)||!Array.isArray(records)||records.length>80)fail(400,'Invalid migration chunk');const contentHash=hash(JSON.stringify(records));const previous=await env.DB.prepare('SELECT content_hash FROM sites_imports WHERE id=?').bind(id).first();if(previous){if(previous.content_hash!==contentHash)fail(409,'Migration chunk changed');return Response.json({id,count:records.length,contentHash,replayed:true})}
 const statements=[];for(const record of records){if(record.type==='roster'){const model=metadata[record.model];if(!model)fail(400,'Unknown roster model');const allowed=model.fields.map(f=>f.name);if(Object.keys(record.row).some(k=>!allowed.includes(k)))fail(400,'Unknown column');const columns=Object.keys(record.row);statements.push(env.DB.prepare(`INSERT INTO "${model.table}" (${columns.map(k=>'"'+k+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...Object.values(record.row)))}
 else if(record.type==='archive')statements.push(env.DB.prepare('INSERT INTO sites_evaluate_archive VALUES (?,?,?)').bind(record.table,record.key,JSON.stringify(record.row)));
 else if(record.type==='account')statements.push(env.DB.prepare('INSERT INTO sites_accounts VALUES (?,?,?)').bind(record.row.id,record.row.username,JSON.stringify(record.row)));
 else if(record.type==='source'&&['workforce','demo-rules'].includes(record.id))statements.push(env.DB.prepare('INSERT INTO sites_source VALUES (?,?)').bind(record.id,JSON.stringify(record.body)));
 else fail(400,'Unknown migration record')}
 statements.push(env.DB.prepare('INSERT INTO sites_imports VALUES (?,?,?)').bind(id,contentHash,new Date().toISOString()));
 if(id==='complete'){if(records.length)fail(400,'Final chunk must be empty');const [accounts,source]=await Promise.all([env.DB.prepare('SELECT count(*) n FROM sites_accounts').first(),env.DB.prepare('SELECT count(*) n FROM sites_source').first()]);if(!accounts.n||source.n!==2)fail(409,'Migration incomplete');const check=await env.DB.prepare('PRAGMA foreign_key_check').all();if(check.results.length)fail(409,'Foreign-key check failed')}
 await env.DB.batch(statements);return Response.json({id,count:records.length,contentHash,replayed:false})
}
export default {async fetch(request,env){try{configureRuntime(env);const url=new URL(request.url),path=url.pathname;
 if(path.startsWith('/api/')){
  if(!env.DB)fail(503,'数据库未连接');
  // Cutover completed: retire the migration surface in the deployed code too.
  // This remains closed even if an older provider revision retains a secret.
  if(path.startsWith('/api/migration/'))fail(403,'Migration endpoint retired after verified cutover');
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==url.origin&&!path.startsWith('/api/migration/'))fail(403,'请求来源不受信任');
  const body=await bodyOf(request);if(path==='/api/migration/import'||path==='/api/migration/verify')return await migration(request,env,body);
  const ready=await env.DB.prepare("SELECT id FROM sites_imports WHERE id='complete'").first();
  if(path==='/api/health')return Response.json({ok:Boolean(ready),services:{database:true,evaluateMolly:Boolean(ready),automaticScheduling:false},deployment:'Sites D1',employeeMode:'mock'},{status:ready?200:503,headers:{'cache-control':'no-store'}});
  if(!ready)fail(503,'正在迁移数据，请稍后重试');
  if(path.startsWith('/api/employee-demo/'))return await demo(request,env.DB,body);
  if(path.startsWith('/api/payroll/')){
   const db=await D1SnapshotClient.load(env.DB),store=new PayrollStore({query:async(sql,args=[])=>{const r=await env.DB.prepare(sql).bind(...args).all();return r.results}}),evaluate=new EvaluateClient(env.DB);
   const service=new PayrollService(store,new XeroClient(store,env),payrollSources(new RosterService(db)));
   const target=new URL(request.url);target.pathname=path.replace('/api/payroll/','/api/');
   return await createPayrollRouter(evaluate,service).handle(new Request(target,{method:request.method,headers:request.headers}),body);
  }
  if(path.startsWith('/api/evaluate/')){
   const auth=new EvaluateClient(env.DB),cookie=request.headers.get('cookie');
   if(path==='/api/evaluate/auth/login'&&request.method==='POST')return await auth.login(loginSchema.parse(body));
   if(path==='/api/evaluate/auth/me'&&request.method==='GET')return Response.json({user:await auth.me(cookie)},{headers:{'cache-control':'no-store, private'}});
   if(path==='/api/evaluate/auth/logout'&&request.method==='POST')return await auth.logout(cookie);
   const target=new URL(request.url);target.pathname=target.pathname.replace('/api/evaluate/','/api/');
   for(let attempt=0;attempt<3;attempt++){const db=await EvaluateSnapshotClient.load(env.DB);if(Object.values(db.state).reduce((n,rows)=>n+rows.length,0)>20000)fail(503,'Data exceeds validated deployment size');const response=await createEvaluationRouter(db).handle(new Request(target,{method:request.method,headers:request.headers}),body);try{await db.commit(env.DB);return response}catch(error){if(error instanceof ConcurrentWrite&&attempt<2)continue;throw error}}
  }
  for(let attempt=0;attempt<3;attempt++){const db=await D1SnapshotClient.load(env.DB);let total=0;for(const rows of Object.values(db.state))total+=rows.length;if(total>20000)fail(503,'数据量超过当前部署的验证范围，请联系管理员扩容');const router=createRouter(new EvaluateClient(env.DB),new RosterService(db));const response=await router.handle(request,body);try{await db.commit(env.DB);return response}catch(error){if(error instanceof ConcurrentWrite&&attempt<2)continue;throw error}}
 }
 const assetPath=assets[path]?path:path.startsWith('/assets/')||path.startsWith('/evaluate/assets/')?null:path==='/evaluate'||path.startsWith('/evaluate/')?'/evaluate/index.html':'/index.html';if(!assetPath)return new Response('Not found',{status:404});const binary=atob(assets[assetPath]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const extension=assetPath.slice(assetPath.lastIndexOf('.'));return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':mime[extension]??'application/octet-stream','cache-control':extension==='.html'?'no-cache':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'"}})
 }catch(error){const status=error instanceof ConcurrentWrite?409:error.name==='ZodError'?400:error.status??(String(error).includes('UNIQUE')?409:500);return Response.json({message:status>=500?'服务暂时不可用，请稍后重试':error.message,...(error.validation?{validation:error.validation}:{})},{status,headers:{'cache-control':'no-store, private'}})}}};
