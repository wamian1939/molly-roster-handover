import {argon2idAsync} from '@noble/hashes/argon2';
let busy=false;
export async function withPasswordWork(work){if(busy)throw Object.assign(new Error('Password service busy; retry shortly'),{status:503});busy=true;try{return await work()}finally{busy=false}}
const decode=text=>Uint8Array.from(atob(text+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
export async function verifyPassword(password,encoded){
 const match=/^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(encoded);
 if(!match)throw new Error('Unsupported password hash');
 const [,version,memory,iterations,parallel,salt,expected]=match;
 if(+version!==19||+memory>32768||+iterations>5||+parallel>4)throw new Error('Password hash exceeds verified deployment limits');
 if(busy)throw Object.assign(new Error('登录繁忙，请稍后重试'),{status:503});
 busy=true;try{const target=decode(expected),actual=await argon2idAsync(password,decode(salt),{version:+version,m:+memory,t:+iterations,p:+parallel,dkLen:target.length,asyncTick:10,maxmem:48*1024*1024});let difference=actual.length^target.length;for(let i=0;i<actual.length;i++)difference|=actual[i]^target[i];return difference===0}finally{busy=false}
}
