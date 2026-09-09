/** Single-cell attention marker only; no whole-table count thresholds. */
export const RULES = { z: 3 };

export interface SampleResult {
  n: number; validDecks: number; invalidDecks: number;
  firstWorstZ: number; firstWorstValue: number;
  allBins: number; allCrossings: number; allWorstZ: number;
  uniform: number[][];
  independence: { pairs: number; equalPairs: number; mu: number; sigma: number; z: number };
  halfTransitions: number[][];
  position: number[][]; hand169: number[][];
  positionCrossings: number; hand169Crossings: number;
}

export function createDeckValidator() {
  const seen = new Uint32Array(52);
  let stamp = 0;
  return (deck: unknown): boolean => {
    if (!Array.isArray(deck) || deck.length !== 52) return false;
    if (++stamp >= 0xffffffff) { seen.fill(0); stamp = 1; }
    for (const c of deck) {
      if (!c || !Number.isInteger(c.rank) || !Number.isInteger(c.suit)
        || c.rank < 0 || c.rank > 12 || c.suit < 0 || c.suit > 3) return false;
      const k = c.suit * 13 + c.rank;
      if (seen[k] === stamp) return false;
      seen[k] = stamp;
    }
    return true;
  };
}

export function hand169Cell(a: {rank:number;suit:number}, b: {rank:number;suit:number}) {
  if (a.rank === b.rank) return { r:12-a.rank, c:12-a.rank };
  const hi = Math.max(a.rank,b.rank), lo = Math.min(a.rank,b.rank);
  return a.suit === b.suit ? {r:12-hi,c:12-lo} : {r:12-lo,c:12-hi};
}
export function cellProb(r:number,c:number):number {
  return (r === c ? 6 : r < c ? 4 : 12) / 1326;
}
export function statOf(actual:number,n:number,p:number) {
  const mu=n*p, sigma=Math.sqrt(n*p*(1-p));
  return { actual,mu,sigma,z:sigma ? (actual-mu)/sigma : 0,rel:mu ? (actual-mu)/mu*100 : 0 };
}
export function crossingsOf(matrix:number[][],n:number,prob:(r:number,c:number)=>number):number {
  return matrix.reduce((sum,row,r)=>sum+row.filter((v,c)=>Math.abs(statOf(v,n,prob(r,c)).z)>RULES.z).length,0);
}
/** Literal definition: all five samples exceed the line in the same direction. */
export function isPersistent(zs:number[]):boolean {
  return zs.length===5 && zs.every(z=>Number.isFinite(z)&&Math.abs(z)>RULES.z&&Math.sign(z)===Math.sign(zs[0]));
}
export function isRepeated(zs:number[]):boolean {
  return zs.filter(z=>Number.isFinite(z)&&z>RULES.z).length>=2
    || zs.filter(z=>Number.isFinite(z)&&z< -RULES.z).length>=2;
}

export function summarize(samples:SampleResult[]) {
  if (samples.length!==5) throw new Error('需要五档完整样本');
  const scan=(kind:'position'|'hand169')=>{
    const repeated:{r:number;c:number;zs:number[];persistent:boolean}[]=[];
    const size=kind==='position'?52:13;
    for(let r=0;r<size;r++) for(let c=0;c<size;c++) {
      const zs=samples.map(s=>statOf(s[kind][r][c],s.validDecks,kind==='position'?1/52:cellProb(r,c)).z);
      if(isRepeated(zs)) repeated.push({r,c,zs,persistent:isPersistent(zs)});
    }
    return repeated;
  };
  const positionRepeated=scan('position'),handRepeated=scan('hand169');
  const angle1Pass=samples.every(s=>s.invalidDecks===0);
  // Legality has a deterministic pass/fail rule. Frequency observations do not.
  const status=angle1Pass?'recorded':'fail';
  const last=samples.at(-1)!;
  return {
    status,angle1Pass,
    angle3Persistent:positionRepeated.filter(x=>x.persistent).length,
    angle4Persistent:handRepeated.filter(x=>x.persistent).length,
    positionRepeated,handRepeated,
    angle3Crossings:last.positionCrossings,angle4Crossings:last.hand169Crossings,
    overallVerdict:status==='fail'?'发现非法牌堆，牌堆合法性验证失败。'
      :'本次牌堆均合法；频率偏差与关注点记录如下。',
  };
}
