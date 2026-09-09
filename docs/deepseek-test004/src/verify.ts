/** Run all five independent sample batches; never rerun to select a passing result. */
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAndShuffleDeck } from './shuffle.ts';
import type { Rng, Card } from './shuffle.ts';
import { createDeckValidator, hand169Cell, cellProb, crossingsOf, statOf, summarize, RULES } from './statistics.ts';
import type { SampleResult } from './statistics.ts';
import { generateReportHtml } from './report.ts';
import { loadRepeated } from './repeated-data.ts';

export const SAMPLE_SIZES=[10000,50000,100000,500000,1000000];
export const SAMPLE_LABELS=['1万','5万','10万','50万','100万'];

export function runSample(n:number, source:Rng=randomInt, shuffler:(rng:Rng)=>Card[]=createAndShuffleDeck):SampleResult {
  if(!Number.isInteger(n)||n<2) throw new Error('样本量须为至少2的整数');
  const uniform=Array.from({length:52},(_,i)=>i?Array(i+1).fill(0):[]);
  const position=Array.from({length:52},()=>Array(52).fill(0));
  const hand169=Array.from({length:13},()=>Array(13).fill(0));
  const halfTransitions=[[0,0],[0,0]];
  const isValidDeck=createDeckValidator();
  let invalidDecks=0,equalPairs=0,prevFirst:number|null=null,firstVal:number|null=null;
  const rng:Rng=(min,max)=>{
    const v=source(min,max);
    if(min!==0||max<2||max>52||!Number.isInteger(v)||v<min||v>=max) throw new Error('随机整数范围非法');
    uniform[max-1][v]++;
    if(max===52) firstVal=v;
    return v;
  };
  for(let h=0;h<n;h++) {
    firstVal=null;
    const deck=shuffler(rng);
    if(firstVal===null) throw new Error('洗牌未调用第一步随机数');
    // Disjoint adjacent pairs: (1,2), (3,4), ...; an odd final hand is unused here.
    if(h%2===1) halfTransitions[prevFirst!<26?0:1][firstVal<26?0:1]++;
    if(prevFirst!==null&&prevFirst===firstVal) equalPairs++;
    prevFirst=firstVal;
    if(!isValidDeck(deck)) { invalidDecks++; continue; }
    for(let p=0;p<52;p++) position[deck[p].suit*13+deck[p].rank][p]++;
    const {r,c}=hand169Cell(deck[0],deck[1]);hand169[r][c]++;
  }
  let firstWorstZ=0,firstWorstValue=0,allCrossings=0,allWorstZ=0,allBins=0;
  for(let i=1;i<=51;i++) {
    if(uniform[i].reduce((a,b)=>a+b,0)!==n) throw new Error('随机调用次数与洗牌步骤不一致');
    for(let v=0;v<=i;v++) {
      const z=statOf(uniform[i][v],n,1/(i+1)).z;
      allBins++;
      if(Math.abs(z)>3) allCrossings++;
      if(Math.abs(z)>Math.abs(allWorstZ)) allWorstZ=z;
      if(i===51&&Math.abs(z)>Math.abs(firstWorstZ)) {firstWorstZ=z;firstWorstValue=v;}
    }
  }
  const d=statOf(equalPairs,n-1,1/52),validDecks=n-invalidDecks;
  return {n,validDecks,invalidDecks,uniform,firstWorstZ,firstWorstValue,allBins,allCrossings,allWorstZ,halfTransitions,
    independence:{pairs:n-1,equalPairs,mu:d.mu,sigma:d.sigma,z:d.z},position,hand169,
    positionCrossings:crossingsOf(position,validDecks,()=>1/52),hand169Crossings:crossingsOf(hand169,validDecks,cellProb)};
}

export function main() {
  const started=Date.now();
  const samples=SAMPLE_SIZES.map(n=>{
    console.log('运行 '+n.toLocaleString('en-US')+' 手…');
    const start=Date.now(),s=runSample(n);
    console.log('完成 '+((Date.now()-start)/1000).toFixed(1)+'s；非法 '+s.invalidDecks+'；位置越线 '+s.positionCrossings+'；牌型越线 '+s.hand169Crossings);
    return s;
  });
  const results={schemaVersion:4,planVersion:'2026-09-09-readable-adjacency',generatedAt:new Date().toISOString(),
    runtime:process.version,durationSeconds:(Date.now()-started)/1000,randomSource:'node:crypto.randomInt',
    sampling:'五档分别采样；每手新建有序牌堆',sampleSizes:SAMPLE_SIZES,sampleLabels:SAMPLE_LABELS,rules:RULES,
    samples,summary:summarize(samples)};
  mkdirSync('results',{recursive:true});
  writeFileSync('results/verify-results.json',JSON.stringify(results));
  writeFileSync('洗牌均匀性验证报告.html',generateReportHtml(results,loadRepeated()));
  console.log(results.summary.overallVerdict);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main();
