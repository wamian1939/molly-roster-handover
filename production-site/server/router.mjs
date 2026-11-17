// A Fetch adapter for the existing explicit Express route/middleware contracts.
// No dynamic code, network forwarding, test authentication, or Node server.
export function Router(){return new FetchRouter()}
class FetchRouter{
 constructor(){this.layers=[]}
 use(path,...handlers){if(typeof path!=='string'){handlers.unshift(path);path='/'}for(const handler of handlers)if(handler.length!==4)this.layers.push({path,handler,prefix:true});return this}
 add(method,path,handlers){for(const handler of handlers)this.layers.push({method,path,handler,prefix:false});return this}
 get(path,...h){return this.add('GET',path,h)} post(path,...h){return this.add('POST',path,h)} put(path,...h){return this.add('PUT',path,h)} patch(path,...h){return this.add('PATCH',path,h)} delete(path,...h){return this.add('DELETE',path,h)}
 async handle(request,body){
  const url=new URL(request.url),req={method:request.method,path:url.pathname.replace(/^\/api/,'')||'/',query:Object.fromEntries(url.searchParams),params:{},body,header:name=>request.headers.get(name)||undefined};
  const headers=new Headers({'cache-control':'no-store, private'});let status=200,output,done=false;
  const res={status(code){status=code;return this},json(value){headers.set('content-type','application/json; charset=utf-8');output=JSON.stringify(value);done=true;return this},send(value){output=value;done=true;return this},setHeader(name,value){headers.set(name,value);return this},append(name,value){headers.append(name,value);return this}};
  async function run(router,path){for(const layer of router.layers){if(done)return;if(layer.method&&layer.method!==req.method)continue;const names=[];const escaped=layer.path.split('/').map(s=>s.startsWith(':')?(names.push(s.slice(1)),'([^/]+)'):s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');const match=new RegExp('^'+(layer.path==='/'&&layer.prefix?'':escaped)+(layer.prefix?'(?:/|$)':'/?$')).exec(path);if(!match)continue;
    if(layer.handler instanceof FetchRouter){await run(layer.handler,path.slice(layer.path.length)||'/');continue}
    req.params=Object.fromEntries(names.map((name,i)=>[name,decodeURIComponent(match[i+1])]));let next=false;
    await layer.handler(req,res,error=>{if(error)throw error;next=true});if(!layer.prefix&&!done&&!next)throw new Error('Route produced no response');
  }}
  await run(this,req.path);return new Response(done?output:JSON.stringify({message:'API endpoint not found'}),{status:done?status:404,headers});
 }
}
