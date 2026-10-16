// Local provider-independent mock protocol. No actual Tahesab endpoint mapping is claimed.
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {validateMockEnvelope,canonical} from '../packages/api/src/didar/tahesab-contract.ts'
const port=Number(process.env.TAHESAB_MOCK_PORT||9109)
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local mock port')
const file=resolve('.local/tahesab-mock-documents.json')
mkdirSync(resolve('.local'),{recursive:true,mode:0o700})
const documents=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{}
const save=()=>writeFileSync(file,JSON.stringify(documents),{mode:0o600})
createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))}
 try{
  if(req.url==='/health'&&req.method==='GET')return send(200,{mode:'MOCK',spec_state:'BLOCKED_BY_SPEC'})
  if(req.headers.authorization!=='Bearer DIDAR_LOCAL_MOCK_ONLY'||!/^QA_[A-Za-z0-9_-]{1,80}$/.test(String(req.headers.dbname||'')))return send(401,{error:'MOCK_AUTH_REQUIRED'})
  if(req.url.startsWith('/mock/document/')&&req.method==='GET'){
   const factor=decodeURIComponent(req.url.slice('/mock/document/'.length)),doc=documents[factor];return send(!doc||doc.deleted?404:200,doc||{error:'MOCK_NOT_FOUND'})
  }
  if(req.url!=='/mock/aggregate'||req.method!=='POST')return send(404,{error:'MOCK_NOT_FOUND'})
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1000000)return send(413,{error:'MOCK_TOO_LARGE'})}
  const payload=validateMockEnvelope({authorization:req.headers.authorization,dbname:String(req.headers.dbname)},JSON.parse(raw))
  if(req.headers['x-didar-mock-outcome']==='transient')return send(503,{error:'MOCK_TRANSIENT'})
  if(req.headers['x-didar-mock-outcome']==='reject')return send(422,{error:'MOCK_REJECTED'})
  const digest=createHash('sha256').update(canonical(payload)).digest('hex'),key=payload.Factor_Code,old=documents[key]
  if(old&&old.payload_hash!==digest)return send(409,{error:'MOCK_CHANGED'})
  if(!old){documents[key]={document_number:'MOCK-'+key,payload_hash:digest,payload};save()}
  return send(200,{state:'acknowledged',document_number:documents[key].document_number,payload_hash:digest})
 }catch{return send(400,{error:'INVALID_MOCK_REQUEST'})}
}).listen(port,'127.0.0.1',()=>console.log(`Didar provider-independent MOCK on 127.0.0.1:${port}; concrete Tahesab mapping BLOCKED_BY_SPEC`))
