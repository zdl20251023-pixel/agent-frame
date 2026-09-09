// Separate data and controls: these observations never use the five-sample selector.
const B=window.REPEATED;
let repeatSelection=null,repeatOpener=null;
const repeatName=i=>handName(Math.floor(i/13),i%13);
const repeatComb=i=>Math.floor(i/13)===i%13?6:Math.floor(i/13)<i%13?4:12;
const repeatStat=(i,k)=>{const b=B.batches[k];return stat(b.counts[i],b.validDecks,repeatComb(i)/1326);};
const repeatLink=(i,text)=>'<button type="button" class="link-btn" data-repeat="'+i+'">'+(text||repeatName(i))+'</button>';
function repeatColor(value,max){
 if(value===null)return ['#eee','#637183'];
 const strength=max?Math.min(Math.abs(value)/max,1):0,base=value>=0?[173,53,46]:[32,91,160];
 return ['rgb('+base.map(v=>Math.round(255+(v-255)*strength)).join(',')+')',strength>.6?'#fff':'#172536'];
}
function repeatLegend(max){return '<span>偏少 '+signed(-max)+'%</span><span class="repeat-scale"></span><span>偏多 '+signed(max)+'%</span><span> · 0为白色；深浅连续变化，以本图实际最大幅度为端点，仅表示幅度，不表示异常等级。</span>';}
function renderRepeated(){
 if(!B)return;
 $('repeatSection').hidden=false;$('repeatJump').hidden=false;
 const s=B.summary,cells=s.cells,most=cells.reduce((a,b)=>Math.abs(b.rel)>Math.abs(a.rel)?b:a);
 const mostAbove=cells.reduce((a,b)=>b.above>a.above?b:a),aboveTies=cells.filter(c=>c.above===mostAbove.above).length;
 const same=cells.filter(c=>c.allGroupsSameDirection),up=same.filter(c=>c.groups[0].direction===1),down=same.filter(c=>c.groups[0].direction===-1);
 const groupText=c=>c.groups.map(g=>signed(g.rel)+'%').join('、');
 $('repeatMetadata').textContent=new Date(B.finishedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间） · '+B.batches.length+'个新进程 · '+B.randomSource;
 $('repeatFacts').textContent='本轮单独统计 '+num(s.totalN)+'手 = '+B.batches.length+'批 × 10,000手；合法 '+num(s.validN)+'手，非法 '+num(s.invalidN)+'手。'+(s.invalidN?'本轮牌堆合法性失败，频率仅按合法手数计算。':'')+'与原有五档的'+num(R.samples.reduce((n,x)=>n+x.n,0))+'手互不包含。';
 const qs=[['200批偏多、偏少，应该刚好各100批吗？','不需要。每批实际次数只能取整数，理论次数可能带小数，因此正常情况下两边机会也不保证精确各半。批次多少只是方向记录，不以超过100批判异常。'],
 ['本轮合计偏差最大的牌型，差了多少？',s.validN?repeatLink(most.i)+'实际'+num(most.actual)+'次，理论'+fmt(most.mu)+'次，次数差'+signed(most.diff)+'，相对偏差'+signed(most.rel)+'%。这是169种中的最大绝对相对偏差，不是已经发现异常。':'本轮没有合法手数，不能比较牌型频率。'],
 ['偏多批次最多，就说明合计偏多吗？',repeatLink(mostAbove.i)+'偏多'+mostAbove.above+'批、偏少'+mostAbove.below+'批、相等'+mostAbove.equal+'批；合计相对偏差为'+signed(mostAbove.rel)+'%。'+(aboveTies>1?'有'+aboveTies+'种牌型并列偏多批次最多，此处列一种。':'')+'方向计数不反映每次多或少的幅度，须与合计次数一起看。'],
 ['四组都朝同一方向，就说明有固定偏向吗？','本轮有'+same.length+'种牌型四组同向，其中都偏多'+up.length+'种、都偏少'+down.length+'种。'+(same.length?repeatLink(same[0].i)+'的四组相对偏差依次为'+groupText(same[0])+'。':'')+'这是按固定分组得到的事实。看169种牌型时，偶然同向也会出现；没有据此设置异常数量线。']];
 const opposite=cells.find(c=>(c.above>c.below&&c.diff<0)||(c.below>c.above&&c.diff>0));
 if(opposite)qs.push(['本轮有没有“多数批次的方向”和合计方向相反？',repeatLink(opposite.i)+'偏多'+opposite.above+'批、偏少'+opposite.below+'批，但200批合计'+(opposite.diff>0?'多':'少')+'约'+fmt(Math.abs(opposite.diff))+'次（'+signed(opposite.rel)+'%）。因为批次投票只看方向，合计次数还包含每批多或少的幅度。']);
 qs.push(['200批、四组和合计，是三份独立证据吗？','它们是同一份200万手数据的三种读法，不能重复算成更多手数。四组之间互不包含，但四组相加就是合计；分批帮助观察是否重现，不会凭空增加样本量。']);
 $('repeatQuestions').innerHTML=qs.map(q=>'<article class="qa"><h3>'+q[0]+'</h3><p>'+q[1]+'</p></article>').join('');
 const max=Math.max(0,...cells.map(c=>Math.abs(c.rel||0)));
 $('repeatOverviewLegend').innerHTML=repeatLegend(max);
 let html='<thead><tr><th></th>'+RANKS.map(r=>'<th scope="col">'+r+'</th>').join('')+'</tr></thead><tbody>';
 for(let r=0;r<13;r++){html+='<tr><th scope="row">'+RANKS[r]+'</th>';
  for(let c=0;c<13;c++){const i=r*13+c,d=cells[i],color=repeatColor(d.rel,max),text=repeatName(i)+'；200批合计；实际'+num(d.actual)+'；理论'+fmt(d.mu)+'；相对偏差'+signed(d.rel)+'%';
   html+='<td><button type="button" class="cell" data-repeat="'+i+'" tabindex="'+(i===0?'0':'-1')+'" style="background:'+color[0]+';color:'+color[1]+'" title="'+text+'" aria-label="'+text+'"><b>'+repeatName(i)+'</b>'+(d.rel===null?'—':signed(d.rel,1)+'%')+'</button></td>';
  }html+='</tr>';
 }$('repeatMatrix').innerHTML=html+'</tbody>';
 $('repeatSameGroups').innerHTML=same.length?same.map(c=>repeatLink(c.i,repeatName(c.i)+(c.groups[0].direction>0?'（四组偏多）':'（四组偏少）'))).join(' '):'<span class="muted">本轮没有四组均同方向的牌型；这不等于证明不存在偏差。</span>';
 $('repeatEvidence').textContent=(s.invalidN?'本轮存在非法牌堆，应先处理合法性问题。':'本轮合法牌堆共'+num(s.validN)+'副。')+'四组同向的牌型共'+same.length+'种，其余'+(169-same.length)+'种未出现四组均同方向；这些是描述性统计。尚未确定同向现象有多罕见，也未测试能检出多小的固定偏差，因此不作均匀性合格结论。';
 $('repeatRunId').textContent='原始记录目录：results/repeated-200/'+B.runId+'；200个批次计数与200个两牌文件保留在本地，未嵌入每手明细。';
}
function renderRepeatDetail(i){
 const d=B.summary.cells[i],name=repeatName(i),batches=B.batches,probability=repeatComb(i)+'/1326';
 $('repeatDetailTitle').textContent=name+' · 200批合计与逐批对照';
 const items=[['合计实际次数',num(d.actual)],['合计理论次数',fmt(d.mu)],['合计相对偏差',d.rel===null?'—':signed(d.rel)+'%'],['偏多批次',d.above],['偏少批次',d.below],['相等 / 无数据批次',d.equal+' / '+d.missing]];
 let html='<div class="detail-metrics">'+items.map(([a,b])=>'<div class="metric"><small>'+a+'</small><b>'+b+'</b></div>').join('')+'</div>';
 html+='<p class="note">'+(B.summary.invalidN?'<b>本轮存在非法牌堆，合法性失败。</b> ':'')+name+'理论概率='+probability+'；合计理论次数='+num(B.summary.validN)+' × '+probability+' ≈ '+fmt(d.mu)+'次。次数差='+num(d.actual)+' − '+fmt(d.mu)+' ≈ '+signed(d.diff)+'次；相对偏差=次数差÷理论次数×100% ≈ '+signed(d.rel)+'%。</p>';
 html+='<h3>四组各50批：换一组数据，方向是否重现？</h3><div class="scroll"><table><thead><tr><th>批次范围</th><th>合法手数</th><th>实际 / 理论次数</th><th>次数差</th><th>相对偏差</th></tr></thead><tbody>';
 d.groups.forEach((g,k)=>{html+='<tr><td>第'+(k*50+1)+'～'+(k*50+50)+'批</td><td>'+num(g.n)+'</td><td>'+num(g.actual)+' / '+fmt(g.mu)+'</td><td>'+signed(g.diff)+'</td><td>'+(g.rel===null?'—':signed(g.rel)+'%')+'</td></tr>';});
 html+='<tr class="current"><td>全部200批</td><td>'+num(B.summary.validN)+'</td><td>'+num(d.actual)+' / '+fmt(d.mu)+'</td><td>'+signed(d.diff)+'</td><td>'+(d.rel===null?'—':signed(d.rel)+'%')+'</td></tr></tbody></table></div>';
 const directions=d.groups.map(g=>g.direction===null?'无有效数据':g.direction>0?'偏多':g.direction<0?'偏少':'相等');
 html+='<p class="note">四组依次为：'+directions.join('、')+'。'+(d.allGroupsSameDirection?'本牌型四组均'+directions[0]+'，可继续观察这种方向是否重现；同向本身不等于固定偏差或异常。':'本牌型没有出现四组均同方向，不能因此排除细小偏差。')+' 四组在采样前按编号固定，不按结果挑选。</p>';
 const stats=batches.map((b,k)=>repeatStat(i,k)),max=Math.max(0,...stats.map(x=>Math.abs(x.rel||0)));
 html+='<h3>这一种牌型的200批</h3><p class="muted">一个小格是一批中的'+name+'，按批次编号排列。数字是该批相对偏差，红偏多、蓝偏少；点击后，计算详情显示在弹窗底部固定区域。颜色尺度仅适用于当前牌型，不能跨牌型只比深浅。</p><div class="legend">'+repeatLegend(max)+'</div><div class="batch-grid">';
 stats.forEach((x,k)=>{const color=repeatColor(x.rel,max);html+='<button type="button" class="batch-tile" data-repeat-batch="'+k+'" aria-pressed="'+(k===0)+'" style="background:'+color[0]+';color:'+color[1]+'" title="第'+(k+1)+'批，实际'+num(x.actual)+'次，理论'+fmt(x.mu)+'次" aria-label="'+name+' 第'+(k+1)+'批，相对偏差'+signed(x.rel)+'%"><small>第'+(k+1)+'批</small>'+(x.rel===null?'—':signed(x.rel,1)+'%')+'</button>';});
 html+='</div><p class="muted">正负按未舍入次数判断；接近0的百分比可能显示为0.0%。少数幅度很大的批次可能影响合计，所以偏多批次占多数不保证合计偏多。未设任何偏多批次数、颜色或百分比异常线。</p>';
 $('repeatDetailContent').innerHTML=html;renderRepeatBatch(i,0);
}
function renderRepeatBatch(i,k){
 const d=repeatStat(i,k),b=B.batches[k];
 $('repeatBatchDetail').innerHTML='<b>'+repeatName(i)+' · 第'+(k+1)+'批</b>　实际'+num(d.actual)+'次，理论'+fmt(d.mu)+'次。<br>'+(d.n?'理论='+num(d.n)+' × '+repeatComb(i)+'/1326；次数差='+num(d.actual)+' − '+fmt(d.mu)+' ≈ '+signed(d.diff)+'次；相对偏差 ≈ '+signed(d.diff)+' ÷ '+fmt(d.mu)+' ×100% = '+signed(d.rel)+'%。':'本批没有合法手数，无法计算偏差。')+(b.invalidDecks?' 本批非法牌堆'+num(b.invalidDecks)+'副，已从次数中排除。':'')+'<br><span class="muted">显示值经四舍五入，计算使用原始值。</span>';
}
function openRepeat(i,from){repeatSelection=i;repeatOpener=from;renderRepeatDetail(i);document.body.style.overflow='hidden';$('repeatDialog').showModal();$('repeatDetailContent').scrollTop=0;}
if(B){
 renderRepeated();
 $('repeatClose').addEventListener('click',()=>$('repeatDialog').close());
 $('repeatDialog').addEventListener('close',()=>{document.body.style.overflow='';if(repeatOpener&&repeatOpener.isConnected)repeatOpener.focus({preventScroll:true});repeatSelection=null;repeatOpener=null;});
 $('repeatDialog').addEventListener('click',e=>{if(e.target===$('repeatDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 $('repeatDialog').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const buttons=Array.from($('repeatDialog').querySelectorAll('button')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.repeat!==undefined)openRepeat(Number(b.dataset.repeat),b);
  else if(b.dataset.repeatBatch!==undefined){$('repeatDetailContent').querySelectorAll('[data-repeat-batch]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderRepeatBatch(repeatSelection,Number(b.dataset.repeatBatch));}
 });
 document.addEventListener('keydown',e=>{const b=e.target.closest('#repeatMatrix [data-repeat]');if(!b||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const i=Number(b.dataset.repeat);let r=Math.floor(i/13),c=i%13;if(e.key==='ArrowLeft')c--;if(e.key==='ArrowRight')c++;if(e.key==='ArrowUp')r--;if(e.key==='ArrowDown')r++;r=Math.max(0,Math.min(12,r));c=Math.max(0,Math.min(12,c));e.preventDefault();b.tabIndex=-1;const next=$('repeatMatrix').querySelector('[data-repeat="'+(r*13+c)+'"]');next.tabIndex=0;next.focus();
 });
}
