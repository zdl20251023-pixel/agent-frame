'use strict';
const R=window.RESULTS;
const $=id=>document.getElementById(id);
const RANKS=['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const CARD_RANKS=['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS=['♣','♦','♥','♠'];
let cur=R.samples.length-1, mode='relative', selection=null, opener=null;
const fmt=(n,d=2)=>Number.isFinite(n)?Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const signed=(n,d=2)=>{const rounded=Number.isFinite(n)&&Math.abs(n)<0.5*10**(-d)?0:n;return (rounded>0?'+':'')+fmt(rounded,d);};
const num=n=>fmt(n,0);
const badge=(status,text)=>'<span class="status '+status+'">'+text+'</span>';
const prob=(r,c)=>(r===c?6:r<c?4:12)/1326;
const cardName=i=>CARD_RANKS[i%13]+SUITS[Math.floor(i/13)];
const handName=(r,c)=>r===c?RANKS[r]+RANKS[c]:r<c?RANKS[r]+RANKS[c]+'s':RANKS[c]+RANKS[r]+'o';
const label=(type,r,c)=>type==='hand'?handName(r,c):cardName(r)+' · 位置'+(c+1);
function stat(actual,n,p){const mu=n*p,sigma=Math.sqrt(n*p*(1-p));return {actual,n,p,mu,sigma,diff:actual-mu,z:sigma?(actual-mu)/sigma:null,rel:mu?(actual-mu)/mu*100:null};}
function get(type,r,c,k=cur){const s=R.samples[k];return stat(s[type==='hand'?'hand169':'position'][r][c],s.validDecks,type==='hand'?prob(r,c):1/52);}
function calculationHtml(type,r,c,k=cur){
 const d=get(type,r,c,k),name=label(type,r,c);
 if(!d.n)return '本档没有合法牌堆，无法计算频率或z-score。';
 const combinations=r===c?6:r<c?4:12,pText=type==='hand'?combinations+'/1326':'1/52';
 const combinationReason=r===c?'4种花色取两种：4 × 3 ÷ 2 = 6种':r<c?'4种花色各有一种同花搭配，共4种':'第一张4种花色，第二张选其余3种：4 × 3 = 12种';
 const basis=type==='hand'?'52张牌任取两张、不分先后，共52 × 51 ÷ 2 = 1326种组合；'+name+'是'+combinationReason+'，所以概率p='+pText+'。':'一张指定牌在52个位置中等概率出现，所以p=1/52。';
 return '<b>'+R.sampleLabels[k]+' · '+name+'，数字这样算：</b> '+basis+'<br>'
  +'理论次数 = '+num(d.n)+' × '+pText+' ≈ <b>'+fmt(d.mu)+'次</b>；σ = √('+num(d.n)+' × '+pText+' × (1−'+pText+')) ≈ <b>'+fmt(d.sigma)+'次</b>。<br>'
  +'也就是说，一份常见波动约为'+fmt(d.sigma)+'次，3份约为'+fmt(3*d.sigma)+'次；这是一把比较差异的尺子，不是保证不超过的上限。<br>'
  +'次数差 = '+num(d.actual)+' − '+fmt(d.mu)+' ≈ '+signed(d.diff)+'次；相对偏差 ≈ '+signed(d.diff)+' ÷ '+fmt(d.mu)+' ×100% ≈ <b>'+signed(d.rel)+'%</b>。<br>'
  +'实际'+num(d.actual)+'次，所以z ≈ ('+num(d.actual)+' − '+fmt(d.mu)+') ÷ '+fmt(d.sigma)+' ≈ <b>'+signed(d.z)+'</b>：'+(d.diff===0?'与理论相同。':(d.diff>0?'比理论多':'比理论少')+'约'+fmt(Math.abs(d.diff))+'次，相当于'+fmt(Math.abs(d.z))+'份正常波动。')
  +'显示值经过四舍五入；关注判断使用未舍入值。';
}
function allCells(type,k=cur){const cells=[],size=type==='hand'?13:52;for(let r=0;r<size;r++)for(let c=0;c<size;c++)cells.push({r,c,...get(type,r,c,k)});return cells;}
function average(type,k){const cells=allCells(type,k);return R.samples[k].validDecks?cells.reduce((sum,d)=>sum+Math.abs(d.rel),0)/cells.length:null;}
function extreme(type,k,metric='rel'){return allCells(type,k).reduce((a,b)=>Math.abs(b[metric])>Math.abs(a[metric])?b:a);}
function initSummary(){const s=R.summary,total=R.samples.reduce((n,x)=>n+x.n,0),invalid=R.samples.reduce((n,x)=>n+x.invalidDecks,0),last=R.samples.at(-1);
 $('metadata').textContent=new Date(R.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间） · '+R.runtime+' · 五档分别采样 · 每手新建牌堆';
 $('conclusion').className='section conclusion '+s.status;
 $('overallStatus').innerHTML=badge(s.status,s.status==='fail'?'牌堆合法性失败':'实测记录');
 $('verdict').textContent=s.overallVerdict;
 $('verdictReason').textContent=(invalid?'累计发现'+num(invalid)+'副非法牌堆，须先处理合法性问题。':'累计'+num(total)+'手，非法牌堆为0。')+R.sampleLabels.at(-1)+'档：随机整数有'+last.allCrossings+'个关注格，单牌位置有'+last.positionCrossings+'个，前两张牌型有'+last.hand169Crossings+'个。以下分别说明单格偏差和整表分布；这些数量不作为整体均匀性的通过或失败标准。';
 $('sampleMath').textContent='总手数怎么算：'+R.samples.map(x=>num(x.n)).join(' + ')+' = '+num(total)+'手。五档分别运行，互不包含；各档频率和波动按该档手数计算，不按这个总和计算。';
 $('metrics').innerHTML=[['累计洗牌',num(total),'五档总和'],['非法牌堆',num(invalid),invalid?'必须处理':'每手完整校验'],['重复关注位置',num(s.positionRepeated.length),'至少两档同方向越线'],['重复关注牌型',num(s.handRepeated.length),'至少两档同方向越线']].map(a=>'<div class="metric"><small>'+a[0]+'</small><b>'+a[1]+'</b><small>'+a[2]+'</small></div>').join('');
 const rngExplanation='<div class="muted">每手洗牌51步，可选值依次有52、51、…、2个；52 + 51 + … + 2 = (52 + 2) × 51 ÷ 2 = 1377格。每格记录“某一步选中某个值多少次”；格数不是手数，每手实际选51次。</div>';
 const rows=[['算法与合法性',invalid?'发现非法牌堆，不能按正常报告解释。':'实现符合倒序交换流程；所有实测牌堆完整合法。'],['随机整数（1377格）','记录每档的关注格数、最极端z和相邻相等次数。'+rngExplanation],['52张牌 × 52位置','52 × 52 = 2704格，每格对应一张牌和一个位置。'+s.positionRepeated.length+'格在至少两档同方向越线，其中'+s.angle3Persistent+'格五档持续越线。'],['前两张牌169类','13种对子 + 78种同花 + 78种非同花 = 169类，每类占一格。'+s.handRepeated.length+'格在至少两档同方向越线，其中'+s.angle4Persistent+'格五档持续越线。']];
 $('overview').innerHTML=rows.map((a,i)=>'<tr><td>'+a[0]+'</td><td>'+badge(i===0?(invalid?'fail':'clear'):'recorded',i===0?(invalid?'失败':'通过'):'描述性统计')+'</td><td class="wrap">'+a[1]+'</td></tr>').join('');
 $('validity').innerHTML=R.samples.map((x,k)=>'<tr><td>'+R.sampleLabels[k]+'</td><td>'+num(x.validDecks)+'</td><td>'+num(x.invalidDecks)+'</td><td>'+badge(x.invalidDecks?'fail':'clear',x.invalidDecks?'失败':'通过')+'</td></tr>').join('');
 $('rng').innerHTML=R.samples.map((x,k)=>{
  let worst=null;
  for(let i=1;i<x.uniform.length;i++)for(let v=0;v<x.uniform[i].length;v++){
   const d={i,v,...stat(x.uniform[i][v],x.n,1/(i+1))};if(!worst||Math.abs(d.z)>Math.abs(worst.z))worst=d;
  }
  return '<tr><td>'+R.sampleLabels[k]+'</td><td>'+num(x.allBins)+'</td><td>'+x.allCrossings+'</td><td>'+fmt(Math.abs(x.allWorstZ))+'</td><td>'+(worst?'第'+(52-worst.i)+'步 / '+worst.v:'—')+'</td><td>'+(worst?num(worst.actual)+' / '+fmt(worst.mu):'—')+'</td><td>'+(worst?signed(worst.diff)+'次 / '+signed(worst.rel)+'%':'—')+'</td><td>'+fmt(Math.abs(x.firstWorstZ))+'（'+x.firstWorstValue+'）</td></tr>';
 }).join('');
 $('adjacentEquality').innerHTML=R.samples.map((x,k)=>{const d=x.independence;return '<tr><td>'+R.sampleLabels[k]+'</td><td>'+num(d.pairs)+'</td><td>'+num(d.equalPairs)+' / '+fmt(d.mu)+'</td><td>'+fmt(d.equalPairs/d.pairs*100,4)+'%</td><td>'+signed(d.z)+'</td><td>'+(Math.abs(d.z)>3?'越线，值得查看':'未越线')+'</td></tr>';}).join('');
}
function renderTransitions(){
 const s=R.samples[cur],rows=s.halfTransitions,names=['前半区（0～25）','后半区（26～51）'];
 const ds=rows.map(row=>stat(row[0],row[0]+row[1],.5));
 $('transitionSample').textContent='当前 '+R.sampleLabels[cur]+'：'+num(s.n)+'手，取'+num(rows.flat().reduce((a,b)=>a+b,0))+'对；随上方样本按钮切换。';
 $('transitionRows').innerHTML=rows.map((row,i)=>{const d=ds[i];return '<tr><td>'+names[i]+'</td><td>'+num(d.n)+'</td><td>'+num(row[0])+' / '+(d.n?fmt(row[0]/d.n*100)+'%':'—')+'</td><td>'+num(row[1])+' / '+(d.n?fmt(row[1]/d.n*100)+'%':'—')+'</td><td>'+(d.n?signed((row[0]/d.n-.5)*100)+'个百分点':'—')+'</td><td>'+signed(d.z)+(d.n?(Math.abs(d.z)>3?' · 越线':' · 未越线'):' · 无数据')+'</td></tr>';}).join('');
 $('transitionReading').textContent=ds.every(d=>d.n)?'怎么读本档：上一手在前半区时，下一手到前半区的比例是'+fmt(ds[0].actual/ds[0].n*100)+'%；上一手在后半区时，这个比例是'+fmt(ds[1].actual/ds[1].n*100)+'%，两行相差'+fmt(Math.abs(ds[0].actual/ds[0].n-ds[1].actual/ds[1].n)*100)+'个百分点。'+(ds.some(d=>Math.abs(d.z)>3)?'至少一行相对50%超过3份波动，值得结合各半区频率和新样本继续检查；不能直接归因为相邻影响。':'两行相对50%都未超过3份波动，本档这项分区检查未提示明显偏离。'):'至少一行没有样本，不能比较两行比例，也不能据此说明不存在相邻影响。';
}
function renderComparisonInsights(){
 const series=type=>R.samples.map((s,k)=>average(type,k));
 const describe=(type,name)=>{const a=series(type);if(a.some(x=>x===null))return name+'存在无有效数据的档位，不能完整比较。';const down=a.every((v,k)=>!k||v<=a[k-1]);return name+'依次为'+a.map(v=>fmt(v)+'%').join(' → ')+'。'+(down?'本轮逐档缩小，符合随机波动的相对幅度通常随样本增大而减小的现象。':a.at(-1)<a[0]?'本轮最大档低于最小档，但中间有起伏；不能说每档都缩小。':'本轮没有出现最大档低于最小档的现象，应结合具体格子继续检查。');};
 const s=R.summary;
 const observations=[['本次看到了什么？',describe('pos','位置平均偏差')+' '+describe('hand','牌型平均偏差')],['有没有同一个格子反复偏向一边？','位置有'+s.positionRepeated.length+'格、牌型有'+s.handRepeated.length+'格至少两档同方向越线，其中五档持续越线分别为'+s.angle3Persistent+'格、'+s.angle4Persistent+'格。'+(s.positionRepeated.length||s.handRepeated.length?'可点击上方重复关注格查看具体次数，确认是哪几档、偏向哪边。':'本轮没有发现这种重复现象；这不等于排除细小偏差或其他问题。')],['这些数据支持什么判断？','平均偏差帮助了解整体幅度，重复格帮助定位持续偏向的线索，关注格数说明需要查看的范围。各档独立采样，不能把某档的偶然越线解释成样本增加导致算法变坏。'],['还不能判断什么？',(s.status==='fail'?'本次已有非法牌堆，合法性失败，须先处理。':'')+'五档不是五次合格证明。整体均匀性、所有调用独立性和线上发牌公平性，不能只凭这些摘要确定；本报告没有用多轮基准实验校准整表判定。']];
 $('comparisonInsights').innerHTML=observations.map(q=>'<article class="qa"><h3>'+q[0]+'</h3><p>'+q[1]+'</p></article>').join('');
}
function sampleButtons(id){$(id).innerHTML=R.sampleLabels.map((s,k)=>'<button type="button" class="btn '+(k===cur?'active':'')+'" aria-pressed="'+(k===cur)+'" data-sample="'+k+'">'+s+'</button>').join('');}
function modeButtons(id){$(id).innerHTML=[['relative','相对偏差 %'],['z','z-score']].map(a=>'<button type="button" class="btn '+(a[0]===mode?'active':'')+'" aria-pressed="'+(a[0]===mode)+'" data-mode="'+a[0]+'">'+a[1]+'</button>').join('');}
function color(d){const v=mode==='z'?d.z:d.rel;if(v===null)return ['#eee','#666'];if(v===0)return ['#fff','#172536'];const a=Math.abs(v),limits=mode==='z'?[1,2,3]:[1,3,5],b=a<=limits[0]?0:a<=limits[1]?1:a<=limits[2]?2:3;return [(v>=0?['#fff0ed','#ffd0c4','#ed947e','#ad352e']:['#edf5ff','#c6dffe','#81b4ef','#205ba0'])[b],b===3?'#fff':'#172536'];}
function display(d){return mode==='z'?signed(d.z,2):signed(d.rel,1)+'%';}
function renderGrid(type){const size=type==='hand'?13:52;let html='<thead><tr><th></th>';
 for(let c=0;c<size;c++)html+='<th scope="col">'+(type==='hand'?RANKS[c]:c+1)+'</th>';
 html+='</tr></thead><tbody>';
 for(let r=0;r<size;r++){html+='<tr><th scope="row">'+(type==='hand'?RANKS[r]:cardName(r))+'</th>';
  for(let c=0;c<size;c++){const d=get(type,r,c),colors=color(d),name=label(type,r,c),text=name+'；'+R.sampleLabels[cur]+'；'+(mode==='z'?'z-score ':'相对偏差 ')+display(d)+'；'+(Math.abs(d.z)>3?'超过3σ关注线':'未超过3σ关注线');
   html+='<td><button type="button" class="cell '+(Math.abs(d.z)>3?'cross':'')+'" tabindex="'+(r===0&&c===0?'0':'-1')+'" data-cell="'+type+'" data-r="'+r+'" data-c="'+c+'" style="background:'+colors[0]+';color:'+colors[1]+'" title="'+text+'" aria-label="'+text+'">'+(type==='hand'?'<b>'+name+'</b>'+display(d):'')+'</button></td>';
  }html+='</tr>';
 }$(type==='hand'?'hm169':'hm52').innerHTML=html+'</tbody>';
}
function renderLegends(){const limits=mode==='z'?['≤1','1–2','2–3','>3']:['≤1%','1–3%','3–5%','>5%'];
 const html='<span>蓝：偏低</span>'+['#edf5ff','#c6dffe','#81b4ef','#205ba0'].map((c,i)=>'<span class="swatch" style="background:'+c+'"></span><span>'+limits[i]+'</span>').join('')+'<span> · 红：偏高，同样分档</span><span class="swatch" style="background:#ad352e"></span><span> · 黑框：|z| > 3，值得关注</span>';
 document.querySelectorAll('[data-legend]').forEach(el=>el.innerHTML=html);
 $('modeHint').textContent=mode==='z'?'看差异相当于多少份正常波动；色标跨样本固定。':'看比理论多/少百分之几；颜色只表示幅度，黑框仍按 z 判断。';
}
function cellLink(type,r,c,text){return '<button type="button" class="link-btn" data-open="'+type+'" data-r="'+r+'" data-c="'+c+'">'+(text||label(type,r,c))+'</button>';}
function repeatList(type){const list=type==='hand'?R.summary.handRepeated:R.summary.positionRepeated;
 return list.length?'<span class="muted">重复关注：</span>'+list.slice(0,12).map(x=>cellLink(type,x.r,x.c,label(type,x.r,x.c)+(x.persistent?'（五档持续）':''))).join(' ') +(list.length>12?'<span class="muted">共'+list.length+'格，此处列前12格；各格五档数字可点击热力图查看。</span>':''):'<span class="muted">未发现至少两档同方向越线的格子；这不等于排除所有偏差。</span>';
}
function renderQuestions(){const s=R.samples[cur],worst=extreme('hand',cur),aa=get('hand',0,0),kk=get('hand',1,1),questions=[];
 if(!s.validDecks){$('questions').innerHTML='<div class="qa"><h3>这档数据还能解释均匀性吗？</h3><p>本档'+num(s.n)+'副全部非法，无法计算有效频率。应先修复牌堆问题。</p></div>';return;}
 const direction=d=>d.diff>=0?'多':'少';
 const observation=d=>direction(d)+'约'+fmt(Math.abs(d.diff),1)+'次（'+signed(d.rel)+'%）';
 questions.push(['这档相对偏差最大的牌型，实际差多少？',cellLink('hand',worst.r,worst.c)+'理论'+fmt(worst.mu)+'次，实际'+num(worst.actual)+'次，'+observation(worst)+'，z='+signed(worst.z)+'。'+(Math.abs(worst.z)>3?'超过关注范围，需结合重复情况复查。':'未超过关注范围；仅凭这个频率差异，还不足以判断存在固定偏向。')]);
 questions.push(['AA、KK真的偏多吗？',cellLink('hand',0,0)+'实际'+num(aa.actual)+'次，理论'+fmt(aa.mu)+'次，'+observation(aa)+'；'+cellLink('hand',1,1)+'实际'+num(kk.actual)+'次，理论'+fmt(kk.mu)+'次，'+observation(kk)+'。'+(Math.abs(aa.z)>3||Math.abs(kk.z)>3?'至少一项越过关注线，建议核对其他档及新样本是否重现。':'两项都未越过关注线，本档没有提供足够证据认定这两种大牌固定偏多。')]);
 const pos=extreme('pos',cur,'z');
 questions.push(['有深色格子，为什么不直接说算法有问题？','本档位置有'+s.positionCrossings+'格、牌型有'+s.hand169Crossings+'格超过 ±3。颜色在相对偏差模式下表示幅度，黑框才表示超过波动关注线。位置中最极端的是'+cellLink('pos',pos.r,pos.c)+'（z='+signed(pos.z)+'）。'+(R.summary.status==='fail'?'本次另有非法牌堆，合法性验证失败。':'偶然的单格越线可能发生；本报告只记录这些关注点，不凭格子数量判断整张表正常或异常。')]);
 const first=R.samples[0],last=R.samples.at(-1),increases=[];
 for(let k=1;k<R.samples.length;k++)for(const [field,name] of [['positionCrossings','位置矩阵'],['hand169Crossings','牌型矩阵']]){if(R.samples[k][field]>R.samples[k-1][field])increases.push(name+' '+R.sampleLabels[k-1]+'→'+R.sampleLabels[k]+'：'+R.samples[k-1][field]+'→'+R.samples[k][field]+'格');}
 questions.push(['样本越大，越线格一定越少吗？',(increases.length?'本次确实出现增加，例如'+increases[0]+'。':'本次两张矩阵均没有出现相邻档位越线数增加，但这不是必须满足的规律。')+'五档分别采样，单格会起伏；z已考虑样本规模，越线数不应要求单调下降。']);
 if(first.validDecks&&last.validDecks)questions.push(['大样本的整体偏差有没有缩小？','169类各格相对偏差绝对值的平均值，从'+R.sampleLabels[0]+'的'+fmt(average('hand',0))+'%变成'+R.sampleLabels.at(-1)+'的'+fmt(average('hand',R.samples.length-1))+'%；位置矩阵从'+fmt(average('pos',0))+'%变成'+fmt(average('pos',R.samples.length-1))+'%。这是本次整体幅度的描述，不能要求每一格都同步缩小。']);
 if(cur>0){let found=null;for(let k=0;k<cur&&!found;k++)for(const x of allCells('hand',cur)){const a=get('hand',x.r,x.c,k);if(a.rel!==null&&Math.abs(x.rel)<Math.abs(a.rel)&&Math.abs(x.z)>Math.abs(a.z)){found={x,a,k};break;}}
  if(found){const {x,a,k}=found;questions.push(['偏差变小，z为什么反而变大？',cellLink('hand',x.r,x.c)+'从'+R.sampleLabels[k]+'到'+R.sampleLabels[cur]+'：相对偏差从'+signed(a.rel)+'%变成'+signed(x.rel)+'%，|z|却从'+fmt(Math.abs(a.z))+'变成'+fmt(Math.abs(x.z))+'。因为大样本通常允许的随机相对波动更小，同样或更小的频率差异也可能更值得关注。']);}
 }else questions.push(['为什么1万手看起来容易偏？','以AA为例，本档理论只有'+fmt(aa.mu)+'次，多1次就相当于约'+fmt(100/aa.mu)+'%的相对偏差。本档实际'+num(aa.actual)+'次，z='+signed(aa.z)+'；要结合波动范围，不能只看百分比。']);
 if(s.invalidDecks)questions.unshift(['这档为什么不能当作正常结果？','存在'+num(s.invalidDecks)+'副非法牌堆；下面频率仅按'+num(s.validDecks)+'副合法牌堆计算，整体仍为失败。']);
 $('questions').innerHTML=questions.map(q=>'<article class="qa"><h3>'+q[0]+'</h3><p>'+q[1]+'</p></article>').join('');
}
function render(){sampleButtons('sampleButtons');modeButtons('modeButtons');renderLegends();renderGrid('hand');renderGrid('pos');renderQuestions();renderTransitions();renderComparisonInsights();
 $('zExample').innerHTML=calculationHtml('hand',4,5)+'<br><span class="muted">例子随样本按钮更新；σ按本档手数及理论概率计算。若有非法牌堆，矩阵只按合法手数计算，整体仍判失败。</span>';
 $('currentSample').textContent='当前 '+R.sampleLabels[cur]+' · '+num(R.samples[cur].validDecks)+'副合法牌堆';
 const s=R.samples[cur];
 $('handSummary').textContent='本档关注 '+s.hand169Crossings+'格 / 169格；五档持续越线 '+R.summary.angle4Persistent+'格。'+(s.invalidDecks?' 本档含非法牌堆，仅展示合法牌堆频率。':'');
 $('positionSummary').textContent='本档关注 '+s.positionCrossings+'格 / 2704格；五档持续越线 '+R.summary.angle3Persistent+'格。'+(s.invalidDecks?' 本档含非法牌堆，仅展示合法牌堆频率。':'');
 $('handRepeated').innerHTML=repeatList('hand');$('positionRepeated').innerHTML=repeatList('pos');
 $('comparison').innerHTML=R.samples.map((x,k)=>'<tr class="'+(k===cur?'current':'')+'"><td><button class="link-btn" data-sample="'+k+'">'+R.sampleLabels[k]+'</button></td><td>'+x.allCrossings+'</td><td>'+x.positionCrossings+'</td><td>'+fmt(average('pos',k))+'%</td><td>'+x.hand169Crossings+'</td><td>'+fmt(average('hand',k))+'%</td></tr>').join('');
 $('backgroundSample').textContent='当前 '+R.sampleLabels[cur]+'（'+num(s.n)+'手），只比较本档，不合并五档数量。';
 $('backgroundRows').innerHTML=[['随机整数',1377,s.allCrossings],['单张牌位置',2704,s.positionCrossings],['前两张牌型',169,s.hand169Crossings]].map(([name,bins,actual])=>'<tr><td>'+name+'</td><td>'+num(bins)+'格</td><td>'+num(bins)+' × 0.27% ≈ '+fmt(bins*0.0027)+'格</td><td>'+actual+'格</td></tr>').join('');
 if(selection)renderDetail();
}
function renderDetail(){const {type,r,c}=selection,d=get(type,r,c),name=label(type,r,c),s=R.samples[cur];
 $('detailTitle').textContent=name+' · '+R.sampleLabels[cur];sampleButtons('dialogSamples');modeButtons('dialogModes');
 const items=[['理论次数',fmt(d.mu)],['实际次数',num(d.actual)],['次数差',signed(d.diff)],['相对偏差',d.n?signed(d.rel)+'%':'—'],['z-score',signed(d.z)],['单个波动尺度 σ',fmt(d.sigma)]];
 let html='<div class="detail-metrics">'+items.map((a,i)=>'<div class="metric '+((mode==='relative'&&i===3)||(mode==='z'&&i===4)?'primary':'')+'"><small>'+a[0]+'</small><b>'+a[1]+'</b></div>').join('')+'</div>';
 html+='<div class="note">'+calculationHtml(type,r,c)+'<br>|z|去掉正负号；大于3表示偏离超过3份正常波动，仅作为关注提示。相对偏差则是次数差÷理论次数×100%。</div>';
 html+='<div class="note">'+(s.invalidDecks?'<b>本档存在非法牌堆，整体失败。</b> ':'')+(d.n?(Math.abs(d.z)>3?'超过 ±3σ 关注范围，值得复查；这不是算法异常的直接证明。':'未超过 ±3σ 关注范围；不等于已经证明没有偏差。'):'没有合法牌堆，无法判断频率。')+'</div>';
 html+='<div class="scroll"><table><tbody><tr><th>理论频率 / 实际频率</th><td>'+fmt(d.p*100,4)+'% / '+(d.n?fmt(d.actual/d.n*100,4)+'%':'—')+'</td></tr><tr><th>每万手折算差异</th><td>'+(d.n?signed((d.actual/d.n-d.p)*10000)+'次':'—')+'（观测折算，不是预测）</td></tr><tr><th>±3σ 关注范围</th><td>'+(d.n?fmt(d.mu-3*d.sigma)+' ～ '+fmt(d.mu+3*d.sigma):'—')+'</td></tr></tbody></table></div>';
 html+='<h3 class="spacer">五档对照</h3><p class="muted">点击样本行切换。百分比和z一起保留，当前展示指标加粗。</p><div class="scroll"><table><thead><tr><th>样本</th><th>实际 / 理论</th><th>次数差</th><th>相对偏差</th><th>z-score</th><th>关注</th></tr></thead><tbody>';
 for(let k=0;k<R.samples.length;k++){const q=get(type,r,c,k);html+='<tr class="'+(k===cur?'current':'')+'"><td><button class="link-btn" data-sample="'+k+'">'+R.sampleLabels[k]+'</button></td><td>'+num(q.actual)+' / '+fmt(q.mu)+'</td><td>'+signed(q.diff)+'</td><td>'+(mode==='relative'?'<b>':'')+signed(q.rel)+'%'+(mode==='relative'?'</b>':'')+'</td><td>'+(mode==='z'?'<b>':'')+signed(q.z)+(mode==='z'?'</b>':'')+'</td><td>'+(q.n?(Math.abs(q.z)>3?'越线':'未越线'):'无有效数据')+'</td></tr>';}
 html+='</tbody></table></div>';
 const repeated=(type==='hand'?R.summary.handRepeated:R.summary.positionRepeated).find(x=>x.r===r&&x.c===c);
 html+='<p class="note">'+(repeated?(repeated.persistent?'该格五档均同方向越线，已列为持续关注。':'该格至少两档同方向越线，已列为重复关注。'):'该格未出现至少两档同方向越线。')+' 五档分别采样，数值不需要逐档增大或减小。</p>';
 $('detailContent').innerHTML=html;
}
function openDetail(type,r,c,from){selection={type,r,c};opener=from;renderDetail();if(!$('detailDialog').open){document.body.style.overflow='hidden';$('detailDialog').showModal();}$('detailContent').scrollTop=0;}
function closeDetail(){$('detailDialog').close();}
$('closeDialog').addEventListener('click',closeDetail);
$('detailDialog').addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;
 const buttons=Array.from($('detailDialog').querySelectorAll('button:not([disabled])'));
 const first=buttons[0],last=buttons.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
$('detailDialog').addEventListener('click',e=>{if(e.target===$('detailDialog')){const b=$('detailDialog').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDetail();}});
$('detailDialog').addEventListener('close',()=>{document.body.style.overflow='';const old=selection;selection=null;const target=opener&&opener.isConnected?opener:old?document.querySelector('[data-cell="'+old.type+'"][data-r="'+old.r+'"][data-c="'+old.c+'"]'):null;if(target)target.focus({preventScroll:true});opener=null;});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.sample!==undefined){const host=b.parentElement.id,key=b.dataset.sample,inDialog=$('detailDialog').contains(b);cur=Number(key);render();const fresh=(host?$(host):$(inDialog?'detailContent':'comparison'))?.querySelector('[data-sample="'+key+'"]');if(fresh)fresh.focus({preventScroll:true});}
 else if(b.dataset.mode){const host=b.parentElement.id;mode=b.dataset.mode;render();$(host)?.querySelector('[data-mode="'+mode+'"]')?.focus({preventScroll:true});}
 else if(b.dataset.cell||b.dataset.open)openDetail(b.dataset.cell||b.dataset.open,Number(b.dataset.r),Number(b.dataset.c),b);
});
document.addEventListener('keydown',e=>{const b=e.target.closest('[data-cell]');if(!b||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;const type=b.dataset.cell,size=type==='hand'?13:52;let r=Number(b.dataset.r),c=Number(b.dataset.c);if(e.key==='ArrowLeft')c--;if(e.key==='ArrowRight')c++;if(e.key==='ArrowUp')r--;if(e.key==='ArrowDown')r++;r=Math.max(0,Math.min(size-1,r));c=Math.max(0,Math.min(size-1,c));e.preventDefault();b.tabIndex=-1;const next=document.querySelector('[data-cell="'+type+'"][data-r="'+r+'"][data-c="'+c+'"]');next.tabIndex=0;next.focus();});
initSummary();render();
