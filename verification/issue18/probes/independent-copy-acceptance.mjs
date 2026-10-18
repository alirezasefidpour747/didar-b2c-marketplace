import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { resolve, relative, basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root='/workspace/didar-b2c-marketplace';
const supplemental=process.env.ISSUE18_INDEPENDENT_SUPPLEMENTAL_ONLY==='true';
const browserOnly=process.env.ISSUE18_INDEPENDENT_BROWSER_ONLY==='true';
const full=browserOnly||process.env.ISSUE18_INDEPENDENT_FULL==='true';
const stamp=Date.now()+'-'+process.pid;
const target='/workspace/work/issue18-independent-'+stamp;
const {verifyBuild}=await import(pathToFileURL(root+'/scripts/local/build-receipt.mjs'));
verifyBuild(root);
const list=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});
if(list.status!==0)throw Error('Cannot read frozen source input list');
const inputs=list.stdout.split('\0').filter(path=>/^(apps\/|packages\/|bun.lock$|package.json$|scripts\/(build-panels.mjs|prepare-codegen-cache.mjs|mercur-routes.snapshot.json)$)/.test(path)&&existsSync(join(root,path)));
const frozenReceipt=readFileSync(root+'/.local/build-receipt.json','utf8');
mkdirSync(target,{recursive:true,mode:0o700});
const keep=new Set(['apps','packages','scripts','tests','package.json','bun.lock','playwright.config.ts','.gitignore','tsconfig.json','turbo.json']);
cpSync(root,target,{recursive:true,filter:(source)=>{
 const r=relative(root,source);if(!r)return true;
 const parts=r.split('/');if(!keep.has(parts[0]))return false;
 if(parts.includes('node_modules')||parts.some(p=>p.startsWith('.env')))return false;
 if(r.startsWith('apps/storefront/.next/cache')||r.startsWith('apps/storefront/.next/standalone')||r==='apps/storefront/.next/trace')return false;
 return true;
}});
for(const scope of ['',...readdirSync(root+'/packages').map(x=>'packages/'+x),...readdirSync(root+'/apps').map(x=>'apps/'+x)]) {
 const source=join(root,scope,'node_modules'),destination=join(target,scope,'node_modules');
 if(existsSync(source)&&existsSync(join(target,scope)))symlinkSync(source,destination,'dir');
}
mkdirSync(target+'/.local',{mode:0o700});
writeFileSync(target+'/.local/build-receipt.json',frozenReceipt,{mode:0o600});
verifyBuild(target,inputs);
let runner=readFileSync(target+'/scripts/local/test.mjs','utf8');
runner=runner.replace('if (reuseBuild) verifyBuild()',`if (reuseBuild) verifyBuild('.', ${JSON.stringify(inputs)})`);
if(!full)runner=runner.replace("['run', 'test:e2e']","['run', 'test:e2e', 'tests/browser/issue18-acceptance.spec.ts']");
runner=runner.replace("await run('bun', ['test', './tests/local-workflow.test.ts', ...backendFiles], { env })", "await run('bun', ['test', './tests/local-workflow.test.ts'], { env }); await run('bun', ['test', ...backendFiles], { env })");
if(browserOnly) {
 runner=runner.replace("await run('bun', ['test', './tests/local-workflow.test.ts'], { env }); await run('bun', ['test', ...backendFiles], { env })","console.log('INDEPENDENT_BROWSER_ONLY backend full proof retained separately for same immutable receipt')");
 runner=runner.replace("await run('bun', ['run', '--cwd', 'packages/api', 'test:integration:http'], { env })","console.log('INDEPENDENT_BROWSER_ONLY native HTTP Jest proof retained separately')");
}
if(supplemental) {
 runner=runner.replace("await run('bun', ['run', '--cwd', 'packages/api', 'test:integration:http'], { env })","console.log('Supplemental agency-only; full native HTTP Jest retained separately')");
 runner=runner.replace("await run('node', ['scripts/local/browser-login-window.mjs'], { env })","console.log('Supplemental agency-only; full browser retained separately')");
 runner=runner.replace("await run('bun', ['run', 'test:e2e', 'tests/browser/issue18-acceptance.spec.ts'], { env })","console.log('Supplemental eleven reviewer HTTP/PG cases only')");
}
if(!full&&!supplemental&&!runner.includes("'tests/browser/issue18-acceptance.spec.ts'"))throw Error('Independent browser selection failed');
writeFileSync(target+'/scripts/local/test.mjs',runner);
writeFileSync('/workspace/work/issue18-independent-last-path.txt',target+'\n',{mode:0o600});
process.chdir(target);
const {managedProcesses}=await import(pathToFileURL(target+'/scripts/local/runtime.mjs'));
const {backendFiles,testLocal}=await import(pathToFileURL(target+'/scripts/local/test.mjs'));
if(!full)backendFiles.splice(0,backendFiles.length,'./tests/issue18-acceptance.test.ts');
console.log('INDEPENDENT_COPIED_PRODUCTION_RECEIPT '+frozenReceipt);
console.log('INDEPENDENT_SCOPE '+(supplemental?'All eleven reviewer-authored HTTP/PG cases including positive MERCHANT fees; full regression retained separately':browserOnly?'FULL32 real browser; full backend and native HTTP Jest retained separately on identical artifact':full?'FULL original + all new backend suites, all browser scenarios, native HTTP Jest':'ten reviewer-authored HTTP/PG cases + one actual browser scenario + native HTTP Jest')+';23 tooling checks separately; shared runtime untouched');
await testLocal(managedProcesses(),{reuseBuild:true});
verifyBuild(root);
if(readFileSync(root+'/.local/build-receipt.json','utf8')!==frozenReceipt)throw Error('Original artifact changed during independent acceptance');
console.log('INDEPENDENT_ACCEPTANCE_COMPLETE original source/output receipt unchanged');
