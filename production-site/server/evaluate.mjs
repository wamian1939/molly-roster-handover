import { verifyPassword } from './password.mjs';
import { createHash,randomBytes } from './crypto.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export const readJson=async response=>response.json();
export const getSetCookieHeaders=response=>response.headers.getSetCookie?.()??(response.headers.get('set-cookie')?[response.headers.get('set-cookie')]:[]);
export const verifiedAuthUser=user=>{if(!user?.id||!['ADMIN','STORE_EVALUATOR'].includes(user.role)||!Array.isArray(user.storeIds))fail(503,'账号资料无效');return user};
const envelope=data=>({contractVersion:'1.4.0',generatedAt:new Date().toISOString(),...data});
export class EvaluateClient{
 constructor(db){this.db=db}
 async me(cookie){const token=cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('evaluate_molly_session='))?.split('=')[1];if(!token)fail(401,'请先登录');const row=await this.db.prepare('SELECT a.body FROM sites_sessions s JOIN sites_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').bind(sha(token),Date.now()).first();if(!row)fail(401,'登录已过期');const account=JSON.parse(row.body);if(!account.isActive||account.deletedAt)fail(401,'账号已停用');return verifiedAuthUser(account.user)}
 async login(input){
  if(input.username.length>100||input.password.length>1024)fail(400,'账号或密码长度超出限制');
  const username=input.username.trim().toLowerCase(),key=sha(username),now=Date.now();
  const rate=await this.db.prepare('INSERT INTO sites_login_limits (id,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts').bind(key,now+300000,now,now).first();
  if(rate.attempts>10)return Response.json({message:'登录尝试过多，请五分钟后重试'},{status:429,headers:{'retry-after':'300'}});
  const row=await this.db.prepare('SELECT body FROM sites_accounts WHERE username=?').bind(username).first();
  const account=row?JSON.parse(row.body):null;const dummy=account??JSON.parse((await this.db.prepare('SELECT body FROM sites_accounts LIMIT 1').first())?.body??'null');
  if(!dummy)fail(503,'账号尚未迁移');
  let valid=false;try{valid=await verifyPassword(input.password,dummy.passwordHash)}catch(error){if(error.status)throw error;fail(503,'账号密码格式暂不支持')}
  if(!account||!valid||!account.isActive||account.deletedAt||account.user.role==='STORE_EVALUATOR'&&!account.user.storeIds.length)return Response.json({message:'用户名或密码错误'},{status:401});
  const token=randomBytes(32).toString('hex'),expires=now+7*86400000;
  await this.db.batch([this.db.prepare('INSERT INTO sites_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)').bind(sha(token),account.id,expires),this.db.prepare('DELETE FROM sites_login_limits WHERE id=?').bind(key),this.db.prepare('DELETE FROM sites_sessions WHERE expires_at<?').bind(now)]);
  return Response.json({user:account.user},{headers:{'set-cookie':`evaluate_molly_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`}})
 }
 async logout(cookie){const token=cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('evaluate_molly_session='))?.split('=')[1];if(token)await this.db.prepare('DELETE FROM sites_sessions WHERE token_hash=?').bind(sha(token)).run();return Response.json({ok:true},{headers:{'set-cookie':'evaluate_molly_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}})}
 async projection(){const row=await this.db.prepare("SELECT body FROM sites_source WHERE id='workforce'").first();if(!row)fail(503,'员工资料尚未迁移');return JSON.parse(row.body)}
 async integration(path,cookie){const user=await this.me(cookie),data=await this.projection();let output;
  if(path==='/contract-version')output={};else if(path==='/stores')output={stores:data.stores.filter(s=>user.role==='ADMIN'||user.storeIds.includes(s.id))};else if(path==='/skill-definitions')output={skills:data.skills};
  else if(path.startsWith('/stores/')){const store=decodeURIComponent(path.split('/')[2]);if(user.role!=='ADMIN'&&!user.storeIds.includes(store))fail(403,'无权访问该门店');const all=data.employees.filter(e=>e.storeId===store&&e.isActive),query=new URL(path,'https://internal').searchParams,page=Number(query.get('page')??1),pageSize=Number(query.get('pageSize')??100);const employees=all.slice((page-1)*pageSize,page*pageSize);output={employees,workforceRevision:data.revision,pagination:{page,pageSize,total:all.length,hasMore:page*pageSize<all.length}}}
  else if(path.startsWith('/employees/')){const id=decodeURIComponent(path.split('/')[2]);const employee=data.employees.find(e=>e.id===id);if(employee&&user.role!=='ADMIN'&&!user.storeIds.includes(employee.storeId))fail(403,'无权访问该员工');output={employee:employee??null}}
  else fail(404,'Unknown workforce route');return Response.json(envelope(output))
 }
 async storeJobs(storeId,cookie){const user=await this.me(cookie);if(user.role!=='ADMIN'&&!user.storeIds.includes(storeId))fail(403,'无权访问该门店');const data=await this.projection();return Response.json(data.jobs.filter(j=>j.storeId===storeId))}
}
