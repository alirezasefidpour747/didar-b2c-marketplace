// Wait for local development restarts or the explicitly selected test API.
const base=process.env.TEST_API_URL||'http://localhost:9000'
const deadline=Date.now()+60000
let ready=false
while(Date.now()<deadline){
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,500))
}
if(!ready)throw new Error('Test API did not become healthy within 60 seconds: '+base)
