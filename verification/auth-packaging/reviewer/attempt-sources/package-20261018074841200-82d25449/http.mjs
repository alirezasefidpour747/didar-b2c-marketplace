import http from 'node:http'
import https from 'node:https'
/** Real loopback TCP source addresses distinguish clients without trusting any
 * client-supplied forwarding header. Returned bodies stay in memory unless a
 * caller deliberately writes a sanitized observation. */
export function request(origin,path,{method='POST',body,headers={},source='127.0.0.2',raw,timeout=20000}={}){
 const url=new URL(path,origin)
 if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Owned loopback HTTP only')
 const payload=raw??(body===undefined?undefined:JSON.stringify(body))
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).request(url,{method,localAddress:source,headers:{...(payload===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}),...headers}},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let value;try{value=JSON.parse(text)}catch{value={text}}resolve({status:res.statusCode,headers:res.headers,body:value})});res.on('error',reject)})
  req.setTimeout(timeout,()=>req.destroy(Error('Owned HTTP timeout')));req.on('error',reject);req.end(payload)
 })
}
export const safe=r=>({status:r.status,message:r.body?.message??null,authenticated:typeof r.body?.token==='string'})
