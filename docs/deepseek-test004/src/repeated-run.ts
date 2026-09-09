/** Launch 200 fresh child processes. No automatic retries; raw run directories are immutable. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repeatHash, loadRepeated } from './repeated-data.ts';

const root=resolve('results/repeated-200'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
const directory=resolve(root,runId),concurrency=Math.max(1,Math.min(4,availableParallelism()));
mkdirSync(directory,{recursive:true});mkdirSync(resolve(directory,'source'));
const sources=['shuffle.ts','statistics.ts','repeated-worker.ts','repeated-data.ts','repeated-run.ts'].map(file=>{
  const source=fileURLToPath(new URL(file,import.meta.url));copyFileSync(source,resolve(directory,'source',file));
  return {file,sha256:repeatHash(readFileSync(source))};
});
const started=Date.now(),launches:any[]=[],errors:any[]=[];
const manifest:any={schemaVersion:1,runId,status:'running',startedAt:new Date().toISOString(),batchCount:200,handsPerBatch:10000,
  grouping:'编号1–50、51–100、101–150、151–200，采样前固定',concurrency,runtime:process.version,
  randomSource:'node:crypto.randomInt',rawFormat:'每手2字节：前两张牌，编码suit*13+rank；255,255为非法牌堆占位',sources,launches,files:[]};
writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest));
let next=1,completed=0;
async function lane(){while(next<=200&&!errors.length){const batchId=next++,invocationId=randomUUID();
  await new Promise<void>(done=>{
    const child=spawn(process.execPath,[resolve(directory,'source','repeated-worker.ts'),directory,String(batchId),invocationId],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const entry:any={batchId,invocationId,pid:child.pid,startedAt:new Date().toISOString()};launches.push(entry);let output='';
    child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    child.on('error',error=>{entry.error=String(error);errors.push(entry);});
    child.on('close',code=>{entry.exitCode=code;entry.finishedAt=new Date().toISOString();
      if(code!==0){entry.output=output;errors.push(entry);}else{completed++;if(completed%25===0)console.log('已完成 '+completed+'/200 个独立进程');}
      done();});
  });
}}
await Promise.all(Array.from({length:concurrency},lane));
manifest.finishedAt=new Date().toISOString();manifest.durationSeconds=(Date.now()-started)/1000;
manifest.status=errors.length?'failed':'complete';manifest.errors=errors;
if(!errors.length)manifest.files=Array.from({length:200},(_,k)=>{const file='batch-'+String(k+1).padStart(3,'0')+'.json';return {file,sha256:repeatHash(readFileSync(resolve(directory,file)))};});
const manifestText=JSON.stringify(manifest);writeFileSync(resolve(directory,'manifest.json'),manifestText);
if(errors.length)throw new Error('有进程失败，已保留全部已生成数据和错误，不自动重跑：'+directory);
// Publish the pointer only after raw observations have all been written.
const pointer={runId,manifestSha256:repeatHash(manifestText)};
writeFileSync(resolve(root,'latest.tmp.json'),JSON.stringify(pointer));
renameSync(resolve(root,'latest.tmp.json'),resolve(root,'latest.json'));
const result=loadRepeated(root)!;
console.log(JSON.stringify({directory,processes:result.batches.length,totalHands:result.summary.totalN,invalidDecks:result.summary.invalidN,durationSeconds:manifest.durationSeconds}));
