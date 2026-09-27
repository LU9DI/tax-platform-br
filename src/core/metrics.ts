type B={count:number;errors:number;conflicts:number;rate_limited:number;sumMs:number;samples:number[]};
const g:B={count:0,errors:0,conflicts:0,rate_limited:0,sumMs:0,samples:[]};
const routes=new Map<string,B>();
const max=200;
function b(p:string){let x=routes.get(p);if(!x){x={count:0,errors:0,conflicts:0,rate_limited:0,sumMs:0,samples:[]};routes.set(p,x)}return x}
export function metricsMiddleware(req:any,res:any,next:any){
 const st=Date.now();
 res.on("finish",()=>{
  const ms=Date.now()-st;
  for(const x of [g,b(req.path)]){
   x.count++;x.sumMs+=ms;x.samples.push(ms);
   if(x.samples.length>max)x.samples.shift();
   if(res.statusCode>=400)x.errors++;
   if(res.statusCode===409)x.conflicts++;
   if(res.statusCode===429)x.rate_limited++;
  }
 });
 next();
}
function v(x:B){
 const s=[...x.samples].sort((a,b)=>a-b);
 return{count:x.count,errors:x.errors,idempotency_conflicts:x.conflicts,rate_limited:x.rate_limited,avg_ms:x.count?Math.round(x.sumMs/x.count):0,p95_ms:s.length?s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)]:null}
}
export function metricsSnapshot(){return{uptime_s:Math.floor(process.uptime()),timestamp:new Date().toISOString(),global:v(g),routes:Object.fromEntries([...routes].map(([k,x])=>[k,v(x)]))}}