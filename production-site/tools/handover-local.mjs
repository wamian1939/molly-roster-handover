// Handover-only loopback adapter. Never calls a production endpoint or database.
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import path from 'node:path';
import {argon2id} from 'hash-wasm';

const root=path.resolve(import.meta.dirname,'..'),check=process.argv.includes('--check');
const password=check?randomBytes(24).toString('base64url'):process.env.HANDOVER_ADMIN_PASSWORD;
if(!password||password.length<12)throw Error('Set HANDOVER_ADMIN_PASSWORD to a local-only password of at least 12 characters.');
const mf=new Miniflare({modules:true,scriptPath:path.join(root,'dist/server/index.js'),compatibilityDate:'2025-05-01',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
async function migrate(file){const text=await readFile(path.join(root,'drizzle',file),'utf8');for(const sql of text.split('--> statement-breakpoint'))if(sql.trim()&&!sql.trim().startsWith('-- No seed')&&!sql.trim().startsWith('-- Generated'))await db.prepare(sql).run()}
const now=new Date().toISOString(),metadata=JSON.parse(await readFile(path.join(root,'generated/evaluate-models.json'),'utf8'));
async function row(model,overrides){const data={};for(const f of metadata[model].fields){if(f.nullable){data[f.name]=null;continue}data[f.name]=f.array?[]:f.enum?f.enum[0]:f.kind==='DateTime'?now:f.kind==='Boolean'?true:['Int','Float','Decimal'].includes(f.kind)?1:f.kind==='Json'?{}:'Synthetic';}Object.assign(data,overrides);await db.prepare('INSERT INTO sites_evaluate_archive VALUES(?,?,?)').bind(metadata[model].table,data.id,JSON.stringify(data)).run();return data}
try{
 await migrate('0000_roster.sql');await migrate('0001_sites.sql');
 const store=await row('store',{id:'synthetic-store-a',name:'Synthetic Store A',region:'Synthetic region',city:'Sydney',managerName:'Synthetic Manager'});
 const passwordHash=await argon2id({password,salt:randomBytes(16),parallelism:1,iterations:2,memorySize:19456,hashLength:32,outputType:'encoded'});
 await row('userAccount',{id:'synthetic-admin',username:'handover-admin',displayName:'Synthetic Admin',passwordHash,role:'ADMIN'});
 await row('skillDefinition',{id:'synthetic-skill-front',code:'FRONT',nameZh:'Synthetic Front',nameEn:'Synthetic Front',category:'operation',skillMode:'PROGRESSIVE',weight:'1',displayOrder:1});
 const job=await row('storeJobDefinition',{id:'synthetic-job-front',storeId:store.id,name:'Synthetic Front',code:'FRONT',colorToken:'slate',displayOrder:1});
 const user={id:'synthetic-admin',accountId:'synthetic-admin',userId:'synthetic-admin',username:'handover-admin',displayName:'Synthetic Admin',role:'ADMIN',storeIds:[],stores:[],canAccessAllStores:true};
 await db.prepare('INSERT INTO sites_accounts VALUES(?,?,?)').bind(user.id,user.username,JSON.stringify({id:user.id,username:user.username,passwordHash,isActive:true,deletedAt:null,user})).run();
 await db.prepare('INSERT INTO sites_source VALUES(?,?)').bind('workforce',JSON.stringify({stores:[{id:store.id,name:store.name,isActive:true}],skills:[],employees:[],jobs:[job],revision:'synthetic-initial'})).run();
 await db.prepare('INSERT INTO sites_source VALUES(?,?)').bind('demo-rules',JSON.stringify({})).run();
 await db.prepare('INSERT INTO sites_imports VALUES(?,?,?)').bind('complete','synthetic-only',now).run();
 await migrate('0002_evaluate_guards.sql');await migrate('0003_xero_payroll.sql');
 if(check){
  const request=async(url,body,cookie)=>{const r=await mf.dispatchFetch('https://handover.test'+url,{method:body?'POST':'GET',headers:{origin:'https://handover.test','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,headers:r.headers,value:await r.json()}};
  assert.equal((await request('/api/health')).status,200);
  assert.equal((await request('/api/auth/me')).status,401);
  const login=await request('/api/auth/login',{username:user.username,password});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/evaluate/stores',null,cookie)).status,200);
  const created=await request('/api/evaluate/employees',{id:'synthetic-employee-001',storeId:store.id,displayName:'Synthetic Employee 001',employmentType:'Casual',employeeType:'REGULAR',jobIds:[job.id]},cookie);
  assert.equal(created.status,201,JSON.stringify(created.value));
  const workforce=await request('/api/workforce/stores/'+store.id+'/employees',null,cookie);assert.equal(workforce.status,200,JSON.stringify(workforce.value));
  assert.ok(workforce.value.employees.some(e=>e.id==='synthetic-employee-001'));
  const payroll=await request('/api/payroll/status',null,cookie);assert.equal(payroll.status,200);assert.equal(payroll.value.configured,false);
  const violations=await db.prepare('PRAGMA foreign_key_check').all();assert.equal(violations.results.length,0);
  console.log(JSON.stringify({passed:true,checks:['health','unauthenticated denied','login','Evaluate stores','synthetic employee creation','Roster workforce projection','Xero unconfigured','foreign keys'],productionRequests:0}));
  await mf.dispose();
 }else{
  const port=Number(process.env.HANDOVER_PORT??18787);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid HANDOVER_PORT');
  const origin='http://127.0.0.1:'+port;
  const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);const r=await mf.dispatchFetch(origin+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});res.statusCode=r.status;for(const[k,v]of r.headers)res.setHeader(k,k==='set-cookie'?v.replace(/; Secure\b/g,''):v);res.end(Buffer.from(await r.arrayBuffer()))}catch{res.statusCode=500;res.end('Local adapter error')}});
  server.listen(port,'127.0.0.1',()=>console.log(`Synthetic isolated site: ${origin}; username handover-admin; password from your environment. Data resets on exit.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();mf.dispose().finally(()=>process.exit(0))});
 }
}catch(error){await mf.dispose();throw error}
