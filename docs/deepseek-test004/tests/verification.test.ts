import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDeck,shuffleDeck,createAndShuffleDeck } from '../src/shuffle.ts';
import {createDeckValidator,hand169Cell,cellProb,isPersistent,isRepeated,statOf,summarize,RULES,crossingsOf} from '../src/statistics.ts';
import type {SampleResult} from '../src/statistics.ts';
import {runSample} from '../src/verify.ts';
import {generateReportHtml} from '../src/report.ts';
import {loadRepeated} from '../src/repeated-data.ts';

test('deck validation rejects aliases, missing entries, invalid types and duplicate cards',()=>{
 const valid=createDeckValidator();assert.equal(valid(createDeck()),true);
 for(const card of [{rank:13,suit:0},{rank:0,suit:4},{rank:-1,suit:1},{rank:1.5,suit:0},{rank:NaN,suit:0},{rank:0,suit:NaN},{rank:0,suit:0.5},{rank:'0',suit:0},null,undefined]){
  const d:any[]=createDeck();d[13]=card;assert.equal(valid(d),false,JSON.stringify(card));
 }
 const d=createDeck();d[1]=d[0];assert.equal(valid(d),false);
 assert.equal(valid(createDeck().slice(1)),false);assert.equal(valid(new Array(52)),false);
 assert.equal(valid(createDeck()),true);assert.equal(valid(createDeck()),true);
});
test('Fisher-Yates visits every four-card permutation once across all choice paths',()=>{
 const results=new Set();
 for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){
  const choices=[a,b,c],calls:number[][]=[];let step=0;
  const out=shuffleDeck(createDeck().slice(0,4),(min,max)=>{calls.push([min,max]);return choices[step++];});
  assert.deepEqual(calls,[[0,4],[0,3],[0,2]]);results.add(out.map(x=>x.rank).join(','));
 }assert.equal(results.size,24);
});
test('169 classification covers every unordered pair with exact multiplicities',()=>{
 const deck=createDeck(),counts=Array.from({length:13},()=>Array(13).fill(0));
 for(let i=0;i<52;i++)for(let j=i+1;j<52;j++){
  const cell=hand169Cell(deck[i],deck[j]);assert.deepEqual(hand169Cell(deck[j],deck[i]),cell);counts[cell.r][cell.c]++;
 }
 for(let r=0;r<13;r++)for(let c=0;c<13;c++)assert.equal(counts[r][c],r===c?6:r<c?4:12);
 assert.equal(counts.flat().reduce((a,b)=>a+b),1326);
});
test('persistent and repeated flags match literal direction and threshold definitions',()=>{
 assert.equal(isPersistent([.1,.5,1,2,3.1]),false);
 assert.equal(isPersistent([4,3.5,5,6,7]),true);
 assert.equal(isPersistent([-4,-3.5,-5,-6,-7]),true);
 for(const zs of [[4,4,4,4,3],[4,4,-4,4,4],[4,4,4,4,NaN],[4,4]])assert.equal(isPersistent(zs),false);
 assert.equal(isRepeated([4,0,-4,0,0]),false);assert.equal(isRepeated([4,0,3.5,0,0]),true);
});
test('biased source is detected; every hand starts with a fresh deck',()=>{
 const s=runSample(1000,(min,max)=>max-1);
 assert.equal(s.invalidDecks,0);assert.equal(s.allBins,1377);assert.ok(s.allCrossings>0);assert.ok(Math.abs(s.allWorstZ)>RULES.z);
 assert.equal(s.position[0][0],1000);assert.equal(s.independence.equalPairs,999);
 assert.ok(s.hand169Crossings>0);assert.ok(s.positionCrossings>0);
});
test('invalid decks fail without crashing or contaminating frequency denominators',()=>{
 let calls=0;
 const s=runSample(10,(min,max)=>max-1,rng=>{const d=createAndShuffleDeck(rng);if(++calls%2===0)d[1]=d[0];return d;});
 assert.equal(s.invalidDecks,5);assert.equal(s.validDecks,5);
 assert.equal(s.hand169.flat().reduce((a,b)=>a+b,0),5);
 assert.equal(s.position[0][0],5);
 assert.throws(()=>runSample(2,()=>NaN),/非法/);
});

test('adjacent half counts use disjoint ordered pairs and preserve boundary values',()=>{
 const sequence=[0,25,25,26,26,25,51,26,0];let h=0;
 const s=runSample(sequence.length,(min,max)=>max===52?sequence[h++]:max-1);
 assert.deepEqual(s.halfTransitions,[[1,1],[1,1]]);
 assert.equal(s.independence.pairs,8);assert.equal(s.independence.equalPairs,2);
 const constant=runSample(9,(min,max)=>max-1);
 assert.deepEqual(constant.halfTransitions,[[0,0],[0,4]]);
});

// Neutral theoretical fixtures isolate verdict behavior from random test failures.
function fixtures(){return [10000,50000,100000,500000,1000000].map(n=>({
 n,validDecks:n,invalidDecks:0,uniform:Array.from({length:52},(_,i)=>i?Array(i+1).fill(n/(i+1)):[]),firstWorstZ:0,firstWorstValue:0,allBins:1377,allCrossings:0,allWorstZ:0,halfTransitions:[[n/8,n/8],[n/8,n/8]],
 independence:{pairs:n-1,equalPairs:Math.round((n-1)/52),mu:(n-1)/52,sigma:Math.sqrt((n-1)/52*51/52),z:0},
 position:Array.from({length:52},()=>Array(52).fill(n/52)),
 hand169:Array.from({length:13},(_,r)=>Array.from({length:13},(_,c)=>n*cellProb(r,c))),positionCrossings:0,hand169Crossings:0,
 } as SampleResult));}
function data(samples=fixtures()){return {generatedAt:'2026-09-09T00:00:00Z',runtime:process.version,rules:RULES,
 sampleLabels:['1万','5万','10万','50万','100万'],samples,summary:summarize(samples)};}

test('summary records frequencies without whole-table pass/fail count gates',()=>{
 let s=fixtures();assert.equal(summarize(s).status,'recorded');
 s[0].positionCrossings=2704;s[0].hand169Crossings=169;s[0].allCrossings=1377;
 assert.equal(summarize(s).status,'recorded');
 assert.deepEqual(RULES,{z:3});
 s=fixtures();s[0].invalidDecks=1;assert.equal(summarize(s).status,'fail');
 s=fixtures();for(let k=0;k<2;k++){const q=statOf(0,s[k].n,1/52);s[k].position[0][0]=q.mu+4*q.sigma;}
 const result=summarize(s);assert.equal(result.status,'recorded');assert.equal(result.positionRepeated.length,1);assert.equal(result.angle3Persistent,0);
 for(const key of ['angle2Pass','angle3Normal','angle4Normal'])assert.equal(key in result,false);
});
function renderInVm(results:any){const elements:any={};
 const el=(id:string)=>elements[id]??={innerHTML:'',textContent:'',className:'',style:{},addEventListener(){},querySelector(){return null;}};
 const document={getElementById:el,querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},body:{style:{}}};
 const context=vm.createContext({document,window:{RESULTS:results},Intl});
 vm.runInContext(fs.readFileSync(new URL('../src/report-client.js',import.meta.url),'utf8'),context);
 return {elements,context};
}
test('report renders all ten combinations and correct card/hand detail labels',()=>{
 const {elements,context}=renderInVm(data());
 for(let k=0;k<5;k++)for(const m of ['z','relative']){
  vm.runInContext(`cur=${k};mode='${m}';selection={type:'pos',r:0,c:0};render();`,context);
  assert.match(elements.detailTitle.textContent,/2♣/);
  assert.equal((elements.hm169.innerHTML.match(/data-cell=/g)||[]).length,169);
  assert.equal((elements.hm52.innerHTML.match(/data-cell=/g)||[]).length,2704);
  assert.match(elements.detailContent.innerHTML,/五档对照/);
  assert.ok(elements.sampleButtons.innerHTML.includes('data-sample="'+k+'"'));
 }
 vm.runInContext("selection={type:'pos',r:12,c:0};renderDetail();",context);assert.match(elements.detailTitle.textContent,/A♣/);
 vm.runInContext("selection={type:'hand',r:0,c:1};renderDetail();",context);assert.match(elements.detailTitle.textContent,/AKs/);
});
test('report separates legality failure from frequency observations',()=>{
 let s=fixtures();s[0].invalidDecks=2;let result=renderInVm(data(s));
 assert.match(result.elements.verdict.textContent,/失败/);assert.match(result.elements.conclusion.className,/fail/);
 assert.match(result.elements.overview.innerHTML,/发现非法牌堆/);
 s=fixtures();s[0].positionCrossings=99;result=renderInVm(data(s));
 assert.match(result.elements.comparison.innerHTML,/>99<\/td>/);
 assert.match(result.elements.overview.innerHTML,/描述性统计/);
 assert.doesNotMatch(result.elements.questions.innerHTML,/未触发|已触发|整体通过/);
 const html=generateReportHtml(data(s));
 assert.doesNotMatch(html,/rngCrossings|handCrossings|数量观察线|10、16、3|未触发/);
 assert.match(html,/一、单个格子/);assert.match(html,/二、整张表/);
});
test('report escapes embedded data and has no external runtime dependencies',()=>{
 const d:any=data();d.extra='</script><script>alert(1)</script>';
 const html=generateReportHtml(d);assert.ok(!html.includes(d.extra));
 assert.equal((html.match(/<script>/g)||[]).length,2);
 assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet/i.test(html));
 assert.ok(!html.includes('/*__CLIENT__*/'));
});
test('new report handles row denominators, empty rows and non-monotonic averages',()=>{
 const s=fixtures();s[4].halfTransitions=[[60,40],[160,240]];
 let result=renderInVm(data(s));
 assert.match(result.elements.transitionReading.textContent,/60.00%/);
 assert.match(result.elements.transitionReading.textContent,/40.00%/);
 assert.match(result.elements.transitionReading.textContent,/20.00个百分点/);
 s[4].halfTransitions=[[0,0],[0,500000]];
 s[2].position[0][0]+=100;
 result=renderInVm(data(s));
 assert.match(result.elements.transitionReading.textContent,/没有样本/);
 assert.doesNotMatch(result.elements.transitionReading.textContent,/未提示明显偏离/);
 assert.match(result.elements.comparisonInsights.innerHTML,/没有出现最大档低于最小档/);
});
test('saved real result matrices and summary can be recalculated',()=>{
 const file=new URL('../results/verify-results.json',import.meta.url),r=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(r.schemaVersion,4);
 for(const s of r.samples){
  assert.equal(s.validDecks+s.invalidDecks,s.n);
  for(const row of s.position)assert.equal(row.reduce((a:number,b:number)=>a+b,0),s.validDecks);
  for(let c=0;c<52;c++)assert.equal(s.position.reduce((a:number,row:number[])=>a+row[c],0),s.validDecks);
  assert.equal(s.hand169.flat().reduce((a:number,b:number)=>a+b,0),s.validDecks);
  assert.equal(crossingsOf(s.position,s.validDecks,()=>1/52),s.positionCrossings);
  assert.equal(crossingsOf(s.hand169,s.validDecks,cellProb),s.hand169Crossings);
  for(let i=1;i<=51;i++)assert.equal(s.uniform[i].reduce((a:number,b:number)=>a+b,0),s.n);
  assert.equal(s.halfTransitions.flat().reduce((a:number,b:number)=>a+b,0),Math.floor(s.n/2));
  assert.ok(s.halfTransitions.flat().every((v:number)=>Number.isInteger(v)&&v>=0));
  assert.equal(statOf(s.independence.equalPairs,s.n-1,1/52).z,s.independence.z);
 }
 assert.deepEqual(summarize(r.samples),r.summary);
 assert.equal(fs.readFileSync(new URL('../洗牌均匀性验证报告.html',import.meta.url),'utf8'),generateReportHtml(r,loadRepeated()));
});

test('200-batch UI shows only selected hand batches and remains separate from five-sample controls',()=>{
 const repeated=loadRepeated();assert.ok(repeated,'本轮200批数据必须存在');
 const {elements,context}=renderInVm(data());
 context.window.REPEATED=repeated;
 vm.runInContext(fs.readFileSync(new URL('../src/repeated-client.js',import.meta.url),'utf8'),context);
 assert.equal((elements.repeatMatrix.innerHTML.match(/data-repeat=/g)||[]).length,169);
 assert.equal(elements.repeatDetailContent,undefined);
 vm.runInContext('renderRepeatDetail(57);',context);
 assert.match(elements.repeatDetailTitle.textContent,/T9s/);
 assert.equal((elements.repeatDetailContent.innerHTML.match(/data-repeat-batch=/g)||[]).length,200);
 assert.match(elements.repeatDetailContent.innerHTML,/第1～50批/);
 const original=elements.repeatMatrix.innerHTML;
 vm.runInContext('cur=0;render();',context);assert.equal(elements.repeatMatrix.innerHTML,original);
 vm.runInContext('renderRepeatBatch(57,199);',context);
 assert.match(elements.repeatBatchDetail.innerHTML,/第200批/);
 const expected=repeated.batches[199].counts[57];assert.ok(elements.repeatBatchDetail.innerHTML.includes('实际'+expected+'次'));
 assert.doesNotMatch(elements.repeatEvidence.textContent,/验证通过|已经证明|未发现稳定/);
});
