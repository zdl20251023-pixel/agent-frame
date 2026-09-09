/** One fresh OS process records one batch; this module never generates a report. */
import { randomInt, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAndShuffleDeck } from './shuffle.ts';
import type { Card, Rng } from './shuffle.ts';
import { createDeckValidator, hand169Cell } from './statistics.ts';

export function collectBatch(n:number, shuffler:(rng:Rng)=>Card[]=createAndShuffleDeck) {
  const valid=createDeckValidator(),counts=Array(169).fill(0),pairs=Buffer.alloc(n*2,255);
  const invalidHands:{hand:number;deck:unknown}[]=[];
  for(let h=0;h<n;h++) {
    const deck=shuffler(randomInt);
    if(!valid(deck)){invalidHands.push({hand:h+1,deck});continue;}
    const a=deck[0],b=deck[1],{r,c}=hand169Cell(a,b);
    counts[r*13+c]++;
    pairs[h*2]=a.suit*13+a.rank;pairs[h*2+1]=b.suit*13+b.rank;
  }
  return {counts,pairs,invalidHands,n,validDecks:n-invalidHands.length,invalidDecks:invalidHands.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [directory,idText,invocationId]=process.argv.slice(2),batchId=Number(idText);
  if(!directory||!Number.isInteger(batchId)||batchId<1||batchId>200||!invocationId)throw new Error('工作进程参数不完整');
  const startedAt=new Date().toISOString(),started=Date.now(),b=collectBatch(10000);
  const stem='batch-'+String(batchId).padStart(3,'0'),pairFile=stem+'.pairs.bin';
  writeFileSync(resolve(directory,pairFile),b.pairs,{flag:'wx'});
  const record={schemaVersion:1,batchId,invocationId,pid:process.pid,startedAt,finishedAt:new Date().toISOString(),
    durationSeconds:(Date.now()-started)/1000,runtime:process.version,randomSource:'node:crypto.randomInt',
    n:b.n,validDecks:b.validDecks,invalidDecks:b.invalidDecks,counts:b.counts,invalidHands:b.invalidHands,
    pairFile,pairSha256:createHash('sha256').update(b.pairs).digest('hex')};
  writeFileSync(resolve(directory,stem+'.json'),JSON.stringify(record),{flag:'wx'});
}
