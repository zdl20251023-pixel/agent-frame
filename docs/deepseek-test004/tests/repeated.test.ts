import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/shuffle.ts';
import { collectBatch } from '../src/repeated-worker.ts';
import { direction, recountPairs, summarizeRepeated, loadRepeated } from '../src/repeated-data.ts';

test('repeated worker preserves ordered first-two cards and excludes illegal decks',()=>{
 let k=0;
 const b=collectBatch(3,()=>{const deck=createDeck();if(++k===2)deck[1]=deck[0];return deck;});
 assert.deepEqual([...b.pairs],[0,1,255,255,0,1]);
 assert.equal(b.invalidDecks,1);assert.equal(b.validDecks,2);
 assert.deepEqual(recountPairs(b.pairs),{counts:b.counts,invalid:1});
 assert.throws(()=>recountPairs(Uint8Array.from([0,0])),/非法/);
});
test('direction uses exact counts, not rounded percentages; groups precede observation',()=>{
 assert.equal(direction(4,1326,1),0);assert.equal(direction(3,1326,1),-1);assert.equal(direction(5,1326,1),1);
 const batches=Array.from({length:200},(_,k)=>{const counts=Array(169).fill(0);counts[1]=k<100?31:29;counts[0]=10000-counts[1];return {batchId:k+1,n:10000,validDecks:10000,invalidDecks:0,counts};});
 const result=summarizeRepeated(batches),cell=result.cells[1];
 assert.equal(cell.above,100);assert.equal(cell.below,100);assert.equal(cell.actual,6000);
 assert.deepEqual(cell.groups.map(g=>g.actual),[1550,1550,1450,1450]);
 assert.equal(cell.allGroupsSameDirection,false);
 assert.equal(cell.groups.reduce((a,g)=>a+g.actual,0),cell.actual);
 assert.ok(cell.rel!<0);assert.equal(result.totalN,2000000);
 batches[0].counts[0]--;assert.throws(()=>summarizeRepeated(batches),/不一致/);
});
test('preserved repeated run, when present, verifies raw data and every process record',()=>{
 const r=loadRepeated();if(!r)return;
 assert.equal(r.batches.length,200);assert.equal(r.summary.totalN,2000000);
 assert.equal(new Set(r.batches.map((b:any)=>b.invocationId)).size,200);
 for(const c of r.summary.cells){assert.equal(c.above+c.below+c.equal+c.missing,200);assert.equal(c.groups.reduce((n:number,g:any)=>n+g.actual,0),c.actual);}
});
