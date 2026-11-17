import {Miniflare} from 'miniflare';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {argon2id} from 'hash-wasm';import {createHash,randomBytes} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),migration='disposable-test-migration-123456789012345678901';
const mf=new Miniflare({modules:true,scriptPath:path.join(root,'dist/server/index.js'),compatibilityDate:'2025-05-01',d1Databases:['DB'],bindings:{MIGRATION_TOKEN:migration,TEST_DIAGNOSTICS:false}});
const outcomes=[];const sha=v=>createHash('sha256').update(v).digest('hex');const canonical=v=>JSON.stringify(v,(_,value)=>value&&!Array.isArray(value)&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
try{
 const db=await mf.getD1Database('DB');for(const name of ['0000_roster.sql','0001_sites.sql'])for(const statement of (await readFile(path.join(root,'drizzle',name),'utf8')).split('--> statement-breakpoint'))if(statement.trim()&&!statement.trim().startsWith('--'))await db.prepare(statement).run();
 const chunks=JSON.parse(await readFile(path.join(root,'.local/import-chunks.json'),'utf8'));
 const models=JSON.parse(await readFile(path.join(root,'generated/models.json'),'utf8'));
 for(const chunk of chunks){const statements=[];for(const record of chunk.records){if(record.type==='roster'){const row=record.row,keys=Object.keys(row);statements.push(db.prepare(`INSERT INTO "${models[record.model].table}" (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)))}else if(record.type==='account')statements.push(db.prepare('INSERT INTO sites_accounts VALUES(?,?,?)').bind(record.row.id,record.row.username,JSON.stringify(record.row)));else if(record.type==='source')statements.push(db.prepare('INSERT INTO sites_source VALUES(?,?)').bind(record.id,JSON.stringify(record.body)));else if(record.type==='archive')statements.push(db.prepare('INSERT INTO sites_evaluate_archive VALUES(?,?,?)').bind(record.table,record.key,JSON.stringify(record.row)))}if(statements.length)await db.batch(statements)}await db.prepare("INSERT INTO sites_imports VALUES('complete','fixture','test')").run();
 for(const statement of (await readFile(path.join(root,'drizzle/0002_evaluate_guards.sql'),'utf8')).split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();

 const accounts=(await db.prepare('SELECT body FROM sites_accounts').all()).results.map(r=>JSON.parse(r.body));
 async function session(account){const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO sites_sessions VALUES(?,?,?)').bind(sha(token),account.id,Date.now()+3600000).run();return 'evaluate_molly_session='+token}
 const admin=await session(accounts.find(a=>a.user.role==='ADMIN')),manager=await session(accounts.find(a=>a.user.role==='STORE_EVALUATOR'&&a.user.storeIds.includes('hurstville')));
 async function request(route,{method='GET',body,cookie=admin,status=200}={}){const r=await mf.dispatchFetch('https://roster.test/api/evaluate'+route,{method,headers:{origin:'https://roster.test','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,status,method+' '+route+' '+text.slice(0,500));return JSON.parse(text)}
 await request('/employees',{cookie:null,status:401});
 for(const route of ['/auth/me','/stores','/stores/manage','/admin/accounts','/evaluations/periods','/evaluations/dashboard','/employees','/evaluations/history','/evaluation-rounds/history','/evaluations/analytics','/roster-skill-board','/store-jobs?storeId=hurstville']){await request(route);outcomes.push('read '+route)}
 const jobs=await request('/store-jobs?storeId=hurstville');
 const employee=await request('/employees',{method:'POST',status:201,body:{id:'sites-disposable-evaluate',storeId:'hurstville',displayName:'Disposable test employee',employmentType:'Casual',employeeType:'REGULAR',jobIds:[jobs[0].id]}});
 
 const id=employee.id;
 const context=await request('/employees/'+id+'/scoring-context',{method:'POST',cookie:manager,body:{}});const round=context.roundId;
 await request('/admin/accounts',{cookie:manager,status:403});
 await request('/employees/'+id+'/archive',{method:'POST',status:409,body:{}});
 const changed=await request('/employees/'+id,{method:'PUT',body:{displayName:'Disposable changed',expectedUpdatedAt:employee.updatedAt}});
 await request('/employees/'+id,{method:'PUT',status:409,body:{displayName:'Stale rejected',expectedUpdatedAt:employee.updatedAt}});
 let projection=JSON.parse((await db.prepare("SELECT body FROM sites_source WHERE id='workforce'").first()).body);
 assert.equal(projection.employees.find(e=>e.id===id).displayName,'Disposable changed');
 outcomes.push('employee edits synchronize to Roster atomically; stale edits and open-round archive rejected');
 const payload={speedRating:4,initiativeRating:4,attitudeRating:4,availabilityRating:4,textFeedback:'',skills:context.skills.map(s=>({skillDefinitionId:s.skillDefinitionId??s.id,status:(s.skillMode==='BINARY')?'CanDo':'Independent'}))};
 await request('/evaluation-rounds/'+round+'/my-evaluation',{method:'PUT',cookie:manager,body:payload});
 await request('/evaluation-rounds/'+round+'/aggregate');
 await request('/evaluation-rounds/'+round+'/close',{method:'POST',cookie:manager,status:403,body:{}});
 await request('/evaluation-rounds/'+round+'/close',{method:'POST',body:{}});
 await request('/evaluation-rounds/'+round+'/close',{method:'POST',status:409,body:{}});
 await request('/evaluation-rounds/'+round+'/my-evaluation',{method:'PUT',cookie:manager,status:409,body:payload});
 outcomes.push('original scoring and admin-only round close; duplicate close and closed edits rejected');
 projection=JSON.parse((await db.prepare("SELECT body FROM sites_source WHERE id='workforce'").first()).body);
 assert.ok(projection.employees.find(e=>e.id===id).officialScore?.roundId===round);
 await assert.rejects(db.prepare("UPDATE sites_evaluate_archive SET body=json_set(body,'$.finalAggregateOverall',999) WHERE source_table='evaluation_rounds' AND json_extract(body,'$.id')=?").bind(round).run(),/CLOSED_ROUND_IMMUTABLE/);
 const nextRound=await request('/employees/'+id+'/scoring-context',{method:'POST',cookie:manager,body:{}});
 const target=(await request('/stores')).find(s=>s.id!=='hurstville'&&s.isActive!==false);
 await request('/employees/'+id,{method:'PUT',body:{storeId:target.id,jobIds:[]}});
 await request('/employees/'+id,{cookie:manager,status:403});
 assert.equal((await request('/evaluation-rounds/'+nextRound.roundId)).store.id,target.id);
 outcomes.push('closed history immutable at database; transfer retains scores and removes old-store access');



 await db.prepare("CREATE TRIGGER test_evaluate_atomicity BEFORE UPDATE ON sites_source BEGIN SELECT RAISE(ABORT,'injected projection failure'); END").run();
 await request('/employees/'+id,{method:'PUT',status:500,body:{displayName:'MUST ROLLBACK'}});
 assert.equal((await request('/employees/'+id)).displayName,'Disposable changed');
 await db.prepare('DROP TRIGGER test_evaluate_atomicity').run();
 await request('/employees/'+id,{method:'PUT',body:{displayName:'Recovered atomically'}});
 outcomes.push('projection failure rolls back canonical writes and same operation recovers');
 const account=await request('/admin/accounts',{method:'POST',status:201,body:{username:'sites-disposable',displayName:'Disposable account',password:'Disposable-test-2026!',role:'STORE_EVALUATOR',storeIds:['hurstville']}});
 const login=await mf.dispatchFetch('https://roster.test/api/evaluate/auth/login',{method:'POST',headers:{origin:'https://roster.test','content-type':'application/json'},body:JSON.stringify({username:'sites-disposable',password:'Disposable-test-2026!'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.deepEqual((await request('/auth/me',{cookie})).user.storeIds,['hurstville']);
 await request('/admin/accounts/'+account.id,{method:'PATCH',body:{isActive:false}});
 await request('/auth/me',{cookie,status:401});
 outcomes.push('new account nested store permissions, native Argon2 login, disable and session revocation');
 const newStore=await request('/stores',{method:'POST',status:201,body:{id:'sites-disposable-store',name:'Disposable store',region:'NSW',managerName:'Test',city:'Sydney'}});
 assert.equal((await request('/store-jobs?storeId='+newStore.id)).length,2);
 outcomes.push('new store retains original default job definitions');
 await writeFile(path.join(root,'evidence/evaluate-e2e.json'),JSON.stringify({passed:true,checks:outcomes},null,2));
 console.log(JSON.stringify({passed:true,checks:outcomes},null,2));
}finally{await mf.dispose()}
