import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve,join } from 'node:path'
import { readFile,writeFile } from 'node:fs/promises'
import {createHash} from 'node:crypto'
const directory=resolve(process.argv[2])
assert.match(directory,/^[a-zA-Z0-9_./-]+$/)
const masks=JSON.parse(await readFile(join(directory,'privacy-masks.json')))
assert.equal(masks.format,1);assert.ok(masks.samples.length>0,'Privacy observations required before publishing')
const regions=new Map()
for(const sample of masks.samples)for(const raw of sample.rects){
 const x=Math.max(0,Math.floor(raw.x/2)*2),y=Math.max(0,Math.floor(raw.y/2)*2)
 const w=Math.min(1280-x,Math.ceil(raw.w/2)*2+2),h=Math.min(900-y,Math.ceil(raw.h/2)*2+2)
 if(w<=0||h<=0)continue
 const key=[x,y,w,h].join(':');const list=regions.get(key)||[];const a=Math.max(0,sample.at_ms-500)/1000,b=(sample.at_ms+600)/1000
 if(list.length&&a<=list.at(-1)[1])list.at(-1)[1]=Math.max(b,list.at(-1)[1]);else list.push([a,b])
 regions.set(key,list)
}
assert.ok(regions.size>0,'Sensitive input observations required')
const filters=[]
for(const[key,list]of regions){const[x,y,w,h]=key.split(':');const enable=list.map(([a,b])=>`between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black:t=fill:enable='${enable}'`)}
filters.push("subtitles="+join(directory,'captions-fa.srt')+":force_style='Fontname=Noto Sans Arabic,Fontsize=17,Outline=1,MarginV=24,BackColour=&H80000000,BorderStyle=3'")
const filterPath=join(directory,'recording-private-filter.txt');await writeFile(filterPath,filters.join(','))
const result=spawnSync('ffmpeg',['-nostdin','-y','-i',join(directory,'seller-journey-raw.webm'),'-filter_script:v',filterPath,'-c:v','libx264','-preset','fast','-crf','30','-pix_fmt','yuv420p','-movflags','+faststart','-an',join(directory,'seller-journey-fa.mp4')],{encoding:'utf8',maxBuffer:1048576,timeout:600000})
const summary={stage:'persian-caption-render',exit_code:result.status,signal:result.signal,spawn_error:result.error?.code||null,stderr_sha256:createHash('sha256').update(result.stderr||'').digest('hex'),privacy_regions:regions.size,editorial:'Actual uncut browser video with Persian SRT and email/password privacy redactions; no DOM/application changes. Raw video is not a public artifact.'}
if(result.status===0)for(const file of ['captions-fa.srt','seller-journey-fa.mp4']){const b=await readFile(join(directory,file));(summary.files||=[]).push({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})}
await writeFile(join(directory,'render-exit.json'),JSON.stringify(summary,null,2)+'\n')
process.exitCode=result.status===0&&!result.signal&&!result.error?0:1
