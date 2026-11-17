// Local CLI only. Reuses Evaluate's real official-score/qualification service in a READ ONLY transaction.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const backend=path.resolve(process.argv[2]);
const storeId=process.argv[3];
const requireEvaluate=createRequire(path.join(backend,'package.json'));
const {parse}=requireEvaluate('dotenv');
const config=parse(fs.readFileSync(path.join(backend,'.env')));
const databaseUrl=config.DATABASE_URL;
if(!databaseUrl||!['localhost','127.0.0.1','::1'].includes(new URL(databaseUrl).hostname))throw new Error('Local Evaluate database required');
const {PrismaClient}=requireEvaluate('@prisma/client');
const {RosterIntegrationService}=await import(pathToFileURL(path.join(backend,'src/rosterIntegrationService.ts')).href);
const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
try{
  const result=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const identity=await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only");
    const service=new RosterIntegrationService(tx);
    const stores=await service.listStores([storeId]);
    if(!stores.stores.some(s=>s.id===storeId))throw new Error('Active store not found');
    const workforce=await service.listEmployees(storeId,[storeId]);
    const jobs=await tx.storeJobDefinition.findMany({where:{storeId},orderBy:{id:'asc'}});
    return {identity:identity[0],stores:stores.stores,employees:workforce.employees,jobs,
      generated_at:new Date().toISOString(),rating_source:'RosterIntegrationService.loadLatestValidClosedAggregates'};
  },{isolationLevel:'RepeatableRead',timeout:30000});
  process.stdout.write(JSON.stringify(result));
}finally{await db.$disconnect();}
