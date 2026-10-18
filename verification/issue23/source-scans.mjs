// Read-only bounded scans. No dependency fixes, environment reads or secret values emitted.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
const out=process.argv[2]
if(!out)throw Error('Supply a NEW output directory')
mkdirSync(out,{recursive:false})
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error('git failed');return r.stdout}
const base=git(['rev-parse','HEAD']).trim(),files=git(['ls-files','-z']).split('\0').filter(Boolean)
const matches=[],rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/g],['aws-access-id',/\bAKIA[0-9A-Z]{16}\b/g],['stripe-live-key',/\bsk_live_[A-Za-z0-9]{20,}\b/g]]
let bytes=0
for(const path of files){const b=readFileSync(path);bytes+=b.length;if(b.includes(0))continue;const source=b.toString('utf8');for(const [rule,pattern]of rules){pattern.lastIndex=0;let m;while((m=pattern.exec(source)))matches.push({path,line:source.slice(0,m.index).split('\n').length,rule,value_sha256:createHash('sha256').update(m[0]).digest('hex')})}}
const secrets={base,scan:'tracked-file four explicit token/private-key signatures; not entropy/history/credential validation',files:files.length,bytes,matches,status:matches.length?'REQUIRES_TRIAGE':'NO_SIGNATURE_MATCH',limitation:'Does not certify absence of secrets. Ignored local .env values were not read. No professional scanner installed.'}
writeFileSync(out+'/secret-signatures.json',JSON.stringify(secrets,null,2)+'\n')
const audit=spawnSync('bun',['audit','--json'],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024})
let advisories=null;try{advisories=JSON.parse(audit.stdout)}catch{}
const summary={base,command:'bun audit --json',exit:audit.status,signal:audit.signal,error_code:audit.error?.code||null,packages:advisories?Object.keys(advisories).length:null,advisories:advisories?Object.values(advisories).flat().length:null,severity:{},status:advisories?'ADVISORIES_REQUIRE_APPLICABILITY_REVIEW':'NOT_VERIFIED',limitation:'Lockfile registry audit; severity does not establish exploitability in enabled paths; no dependency mutation.'}
if(advisories){for(const a of Object.values(advisories).flat())summary.severity[a.severity]=(summary.severity[a.severity]||0)+1;writeFileSync(out+'/dependency-advisories.json',JSON.stringify(advisories,null,2)+'\n')}
writeFileSync(out+'/scan-receipt.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({secrets:{status:secrets.status,matches:matches.length,files:files.length},dependencies:summary}))
if(!advisories)process.exitCode=1
