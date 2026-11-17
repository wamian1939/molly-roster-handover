import {readFile,writeFile,mkdir,cp,readdir,access} from 'node:fs/promises';
import path from 'node:path';
const site=path.resolve(import.meta.dirname,'..'),root=path.resolve(site,'../..');
await mkdir(path.join(site,'generated/vendor'),{recursive:true});
let originalAvailable=false;
if(originalAvailable){
 await cp(path.join(root,'backend/src'),path.join(site,'generated/vendor'),{recursive:true});
 await cp(path.join(root,'src'),path.join(site,'frontend/src'),{recursive:true});
 for(const name of ['index.html','tailwind.config.js','postcss.config.js']){try{await cp(path.join(root,name),path.join(site,'frontend',name))}catch(e){if(e.code!=='ENOENT')throw e}}
 await cp(path.join(root,'backend/prisma/schema.prisma'),path.join(site,'generated/roster.prisma'));
}
const source=(await readFile(path.join(site,'generated/roster.prisma'),'utf8')).replaceAll('\r','');
const modelNames=[...source.matchAll(/model (\w+)\s*\{/g)].map(m=>m[1]);const metadata={};
for(const [,name,body]of source.matchAll(/model (\w+)\s*\{([^}]+)\}/g)){
 if(name.startsWith('Payroll'))continue;
 const fields=[];for(const line of body.split('\n')){const m=/^\s*(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/.exec(line);if(!m||modelNames.includes(m[2]))continue;fields.push({name:m[1],kind:m[2],array:m[3]==='[]',nullable:m[3]==='?',attrs:m[4].trim()})}
 if(!fields.some(f=>f.attrs.includes('@id')))throw new Error('Prisma metadata primary key could not be parsed for '+name);
 const unique=fields.filter(f=>f.attrs.includes('@id')||f.attrs.includes('@unique')).map(f=>[f.name]);for(const m of body.matchAll(/@@unique\(\[([\w,\s]+)\]\)/g))unique.push(m[1].split(',').map(s=>s.trim()));
 metadata[name[0].toLowerCase()+name.slice(1)]={table:/@@map\("([^"]+)"\)/.exec(body)[1],fields,unique};
}
await writeFile(path.join(site,'generated/models.json'),JSON.stringify(metadata));
await writeFile(path.join(site,'generated/vendor/prisma.ts'),"export {prisma} from '../../server/prisma-shim.mjs';\n");
await writeFile(path.join(site,'generated/vendor/evaluateClient.ts'),"export * from '../../server/evaluate.mjs';\n");
await writeFile(path.join(site,'generated/vendor/multiAgentRoutes.ts'),`import {Router} from 'express';export function createMultiAgentRouter(){const router=Router();router.use((_req,res)=>res.status(503).json({message:'自动排班计算服务尚未连接。手动排班可以正常使用。'}));return router}`);
// Only the hosted copy enables the explicitly approved mock employee portal.
let app=await readFile(path.join(site,'frontend/src/App.tsx'),'utf8');app=app.replace('(import.meta.env.DEV || import.meta.env.VITE_EMPLOYEE_PORTAL_MODE === "account")','(true)');await writeFile(path.join(site,'frontend/src/App.tsx'),app);
let employee=await readFile(path.join(site,'frontend/src/services/employeePortalRepository.ts'),'utf8');employee=employee.replace('import.meta.env.VITE_EMPLOYEE_PORTAL_MODE === "account" || import.meta.env.PROD ? "account" : "demo"','"demo"');await writeFile(path.join(site,'frontend/src/services/employeePortalRepository.ts'),employee);
await writeFile(path.join(site,'frontend/vite.config.mjs'),`import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],build:{outDir:'../dist/client',emptyOutDir:true},define:{'import.meta.env.VITE_API_BASE_URL':'"/api"'}});`);
// Exclude tests from the independent source checkout to keep remote installation bounded.
async function cleanTests(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await cleanTests(p);else if(/\.test\.|testSetup/.test(e.name)){const {unlink}=await import('node:fs/promises');await unlink(p)}}}await cleanTests(path.join(site,'frontend/src'));
console.log('Prepared independent source copy; original application unchanged.');
