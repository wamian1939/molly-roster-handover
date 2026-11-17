import Decimal from 'decimal.js';
export class PrismaClientKnownRequestError extends Error{constructor(message,options={}){super(message);this.code=options.code;this.meta=options.meta;this.name='PrismaClientKnownRequestError'}}
export const Prisma={Decimal,PrismaClientKnownRequestError,JsonNull:null,DbNull:null,TransactionIsolationLevel:{RepeatableRead:'RepeatableRead',Serializable:'Serializable'},sql:(strings,...values)=>({text:strings.join('?'),values}),join:values=>({text:values.map(()=>'?').join(','),values})};
export const prisma=null;
export class PrismaClient {constructor(){throw new Error('Use request-scoped D1SnapshotClient')}}
