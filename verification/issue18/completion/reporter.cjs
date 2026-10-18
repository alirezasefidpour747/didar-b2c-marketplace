const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}
class CompletionReporter{
 constructor(){this.dir=process.env.ISSUE18_COMPLETION_RUN_DIR;this.phase=process.env.ISSUE18_COMPLETION_PHASE;this.results=[];if(!this.dir||!['discovery','browser'].includes(this.phase))throw Error('Explicit owned reporter context required')}
 onBegin(config,suite){this.tests=suite.allTests().map(t=>({id:t.id,title:t.titlePath().filter(Boolean).join(' › '),file:path.relative(config.rootDir,t.location.file),line:t.location.line}));atomic(path.join(this.dir,this.phase+'-identities.json'),{run_id:process.env.ISSUE18_COMPLETION_RUN_ID,tests:this.tests})}
 onTestEnd(test,result){const row={id:test.id,status:result.status,expected_status:test.expectedStatus,retry:result.retry,duration_ms:result.duration,errors:result.errors.map(e=>({message:e.message,stack:e.stack}))};this.results.push(row);const fd=fs.openSync(path.join(this.dir,'browser-results.jsonl'),'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
 onEnd(result){atomic(path.join(this.dir,this.phase+'-reporter-end.json'),{run_id:process.env.ISSUE18_COMPLETION_RUN_ID,status:result.status,observed_results:this.results.length,results:this.results,exit_code:'NOT_OBSERVED_BY_REPORTER'})}
}
module.exports=CompletionReporter;
