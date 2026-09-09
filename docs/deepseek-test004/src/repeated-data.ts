/** Read and verify preserved observations, then derive every displayed number. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hand169Cell } from './statistics.ts';

export const repeatHash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const combinations=(i:number)=>Math.floor(i/13)===i%13?6:Math.floor(i/13)<i%13?4:12;
export function direction(actual:number,n:number,i:number) {
  // Compare exact integer numerators; neither direction nor equality uses rounded values.
  return Math.sign(actual*1326-n*combinations(i));
}
export function recountPairs(bytes:Uint8Array) {
  if(bytes.length%2)throw new Error('两牌原始记录长度非法');
  const counts=Array(169).fill(0);let invalid=0;
  for(let j=0;j<bytes.length;j+=2){const a=bytes[j],b=bytes[j+1];
    if(a===255&&b===255){invalid++;continue;}
    if(a>51||b>51||a===b)throw new Error('两牌原始编码非法');
    const {r,c}=hand169Cell({rank:a%13,suit:Math.floor(a/13)},{rank:b%13,suit:Math.floor(b/13)});counts[r*13+c]++;
  }
  return {counts,invalid};
}
export function summarizeRepeated(batches:any[]) {
  if(batches.length!==200||batches.some((b,k)=>b.batchId!==k+1||b.n!==10000))throw new Error('须为按编号排列的200批，每批10000手');
  for(const b of batches)if(b.counts.length!==169||b.counts.some((x:number)=>!Number.isInteger(x)||x<0)
    ||b.counts.reduce((a:number,v:number)=>a+v,0)!==b.validDecks||b.validDecks+b.invalidDecks!==b.n)throw new Error('批次计数不一致');
  const totalN=batches.reduce((a,b)=>a+b.n,0),validN=batches.reduce((a,b)=>a+b.validDecks,0);
  const groupNs=Array.from({length:4},(_,g)=>batches.slice(g*50,g*50+50).reduce((a,b)=>a+b.validDecks,0));
  const cells=Array.from({length:169},(_,i)=>{
    const counts=batches.map(b=>b.counts[i]);let above=0,below=0,equal=0,missing=0;
    batches.forEach((b,k)=>{if(!b.validDecks){missing++;return;}const s=direction(counts[k],b.validDecks,i);if(s>0)above++;else if(s<0)below++;else equal++;});
    const actual=counts.reduce((a,b)=>a+b,0),mu=validN*combinations(i)/1326;
    const groups=groupNs.map((n,g)=>{const actual=counts.slice(g*50,g*50+50).reduce((a,b)=>a+b,0),mu=n*combinations(i)/1326;return {n,actual,mu,diff:actual-mu,rel:n?(actual-mu)/mu*100:null,direction:n?direction(actual,n,i):null};});
    return {i,actual,mu,diff:actual-mu,rel:validN?(actual-mu)/mu*100:null,above,below,equal,missing,groups,
      allGroupsSameDirection:groups.every(g=>g.direction===1)||groups.every(g=>g.direction===-1)};
  });
  return {totalN,validN,invalidN:totalN-validN,groupNs,cells};
}
export function loadRepeated(root=resolve('results/repeated-200')) {
  const latest=resolve(root,'latest.json');if(!existsSync(latest))return null;
  const pointer=JSON.parse(readFileSync(latest,'utf8'));
  if(!/^[\w-]+$/.test(pointer.runId))throw new Error('运行目录非法');
  const directory=resolve(root,pointer.runId),manifestBytes=readFileSync(resolve(directory,'manifest.json'));
  if(repeatHash(manifestBytes)!==pointer.manifestSha256)throw new Error('运行清单校验失败');
  const manifest=JSON.parse(manifestBytes.toString());
  if(manifest.status!=='complete'||manifest.files.length!==200||manifest.runId!==pointer.runId)throw new Error('200批实验未完整完成');
  const batches=manifest.files.map((entry:any,k:number)=>{
    const stem='batch-'+String(k+1).padStart(3,'0');
    if(entry.file!==stem+'.json')throw new Error('批次文件顺序错误');
    const bytes=readFileSync(resolve(directory,entry.file));if(repeatHash(bytes)!==entry.sha256)throw new Error('批次文件校验失败');
    const b=JSON.parse(bytes.toString());if(b.pairFile!==stem+'.pairs.bin')throw new Error('两牌文件名错误');
    const pairs=readFileSync(resolve(directory,b.pairFile));
    if(pairs.length!==b.n*2||repeatHash(pairs)!==b.pairSha256)throw new Error('两牌原始记录校验失败');
    const recounted=recountPairs(pairs);
    if(recounted.invalid!==b.invalidDecks||JSON.stringify(recounted.counts)!==JSON.stringify(b.counts))throw new Error('原始两牌复算不一致');
    const launch=manifest.launches.find((x:any)=>x.batchId===k+1);
    if(!launch||launch.pid!==b.pid||launch.invocationId!==b.invocationId||launch.exitCode!==0)throw new Error('子进程记录不一致');
    return b;
  });
  if(new Set(batches.map((b:any)=>b.invocationId)).size!==200)throw new Error('子进程启动标识重复');
  return {schemaVersion:1,runId:manifest.runId,startedAt:manifest.startedAt,finishedAt:manifest.finishedAt,
    durationSeconds:manifest.durationSeconds,concurrency:manifest.concurrency,randomSource:manifest.randomSource,
    batches:batches.map(({invalidHands,...b}:any)=>b),summary:summarizeRepeated(batches)};
}
