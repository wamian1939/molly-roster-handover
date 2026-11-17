import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.resume();console.log('Ready for private migration credentials on stdin (input is hidden).');
let input='';process.stdin.on('data',async bytes=>{input+=bytes.toString();if(!/[\r\n]/.test(input))return;process.stdin.pause();try{
 const {token,bypass,url,verifyOnly=false}=JSON.parse(input.trim());input='';
 if(new URL(url).hostname!=='molly-tea-roster-migration-20261115.light-lyric-6601.chatgpt.site')throw new Error('Unexpected Site host');
 const headers={'authorization':'Bearer '+token,'content-type':'application/json',...(bypass?{'OAI-Sites-Authorization':'Bearer '+bypass}:{})};
 if(!verifyOnly){const chunks=JSON.parse(await readFile(path.join(root,'.local/import-chunks.json'),'utf8'));for(const chunk of chunks){let response;for(let n=0;n<3;n++){response=await fetch(url+'/api/migration/import',{method:'POST',headers,body:JSON.stringify(chunk),signal:AbortSignal.timeout(60000),redirect:'error'});if(response.ok)break;if(response.status<500)break;}if(!response.ok)throw new Error('Migration '+chunk.id+' returned HTTP '+response.status+': '+(await response.text()).slice(0,180));const result=await response.json();console.log(JSON.stringify({id:result.id,count:result.count,replayed:result.replayed}));}}
 const verification=await fetch(url+'/api/migration/verify',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(60000),redirect:'error'});if(!verification.ok)throw new Error('Verification HTTP '+verification.status);const result=await verification.json();
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v),sha=value=>createHash('sha256').update(value).digest('hex');
 const models=JSON.parse(await readFile(path.join(root,'generated/models.json'),'utf8')),expected={},archive=[];for(const chunk of JSON.parse(await readFile(path.join(root,'.local/import-chunks.json'),'utf8')))for(const record of chunk.records){if(record.type==='roster'){const table=models[record.model].table;(expected[table]??=[]).push(record.row)}else if(record.type==='archive')archive.push({source_table:record.table,record_key:record.key,body:JSON.stringify(record.row)})}
 for(const [table,rows]of Object.entries(expected)){if(result.rosterCounts[table]!==rows.length||result.rosterDigests[table]!==sha(canonical(rows.map(canonical).sort())))throw new Error('Cloud field reconciliation failed for '+table)}
 if(result.evaluateArchiveRows!==archive.length||result.evaluateArchiveDigest!==sha(canonical(archive.map(canonical).sort()))||result.foreignKeyViolations!==0||!result.sealed)throw new Error('Cloud archive or integrity reconciliation failed');
 result.allFieldsReconciled=true;await writeFile(path.join(root,'evidence/cloud-data-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exit(0);
}catch(error){console.error(error.message);process.exit(1)}});
