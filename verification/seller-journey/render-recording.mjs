import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve,join } from 'node:path'
import { readFile,writeFile } from 'node:fs/promises'
import {createHash} from 'node:crypto'
const directory=resolve(process.argv[2])
assert.match(directory,/^[a-zA-Z0-9_./-]+$/)
const result=spawnSync('ffmpeg',['-nostdin','-y','-i',join(directory,'seller-journey-raw.webm'),'-vf',"subtitles="+join(directory,'captions-fa.srt')+":force_style='Fontname=Noto Sans Arabic,Fontsize=17,Outline=1,MarginV=24,BackColour=&H80000000,BorderStyle=3'",'-c:v','libx264','-preset','fast','-crf','30','-pix_fmt','yuv420p','-movflags','+faststart','-an',join(directory,'seller-journey-fa.mp4')],{encoding:'utf8',maxBuffer:1048576,timeout:600000})
const summary={stage:'persian-caption-render',exit_code:result.status,signal:result.signal,spawn_error:result.error?.code||null,stderr_sha256:createHash('sha256').update(result.stderr||'').digest('hex'),editorial:'Actual uncut browser video with Persian SRT burned in; no DOM/application changes'}
if(result.status===0)for(const file of ['seller-journey-raw.webm','captions-fa.srt','seller-journey-fa.mp4']){const b=await readFile(join(directory,file));(summary.files||=[]).push({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})}
await writeFile(join(directory,'render-exit.json'),JSON.stringify(summary,null,2)+'\n')
process.exitCode=result.status===0&&!result.signal&&!result.error?0:1
