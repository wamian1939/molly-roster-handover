import {argon2idAsync} from '@noble/hashes/argon2';import {verifyPassword,withPasswordWork} from './password.mjs';
export const Algorithm={Argon2id:2};
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=+$/,'');
export async function hash(password,options){return withPasswordWork(async()=>{const salt=crypto.getRandomValues(new Uint8Array(16));const m=options.memoryCost,t=options.timeCost,p=options.parallelism;const result=await argon2idAsync(password,salt,{m,t,p,dkLen:options.outputLen,asyncTick:10,maxmem:48*1024*1024});return `$argon2id$v=19$m=${m},t=${t},p=${p}$${base64(salt)}$${base64(result)}`})}
export async function verify(encoded,password){return verifyPassword(password,encoded)}
