import {targetMatch,studyItem,wordStatus,goalLabel} from './engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function labelLines(value){const lines=[''];let width=0;for(const c of value){const step=/[\u0000-\u007f]/.test(c)?7:14;if(width+step>120){if(lines.length===2){lines[1]=lines[1].slice(0,-1)+'…';break;}lines.push('');width=0;}lines[lines.length-1]+=c;width+=step;}return lines;}

export function growthModel(f,lib,state,expanded=new Set(),scale=1){
  const root='root:'+f.id,allowed=new Set([root]);
  for(const id of f.wordIds){const w=lib.words[id];if(!targetMatch(w,state.settings.goal)&&!(w.studyItemIds||[]).some(x=>targetMatch(studyItem(lib,x),state.settings.goal)))continue;
    allowed.add(id);let child=id;const visited=new Set();
    while(!visited.has(child)){visited.add(child);const edge=f.edges.find(e=>e.to===child);if(!edge)break;allowed.add(edge.from);child=edge.from;if(child===root)break;}
  }
  const visible=new Set([root]),depth={[root]:0},queue=[root],tree=new Map();
  while(queue.length){const id=queue.shift();if(!expanded.has(id))continue;for(const edge of f.edges.filter(e=>e.from===id&&allowed.has(e.to))){if(visible.has(edge.to))continue;visible.add(edge.to);depth[edge.to]=depth[id]+1;if(!tree.has(id))tree.set(id,[]);tree.get(id).push(edge.to);queue.push(edge.to);}}
  // Keep each branch together. A parent sits between its first and last child,
  // rather than being independently centred in an unrelated column of words.
  const positions={};let leaf=0;
  function place(id){const children=tree.get(id)||[];let y;if(children.length){const rows=children.map(place);y=(rows[0]+rows.at(-1))/2;}else y=32+leaf++*140;positions[id]={x:32+depth[id]*360,y};return y;}
  place(root);const height=Math.max(360,leaf*140+36),width=Math.max(450,Math.max(...Object.values(depth))*360+272),offset=(height-(leaf*140+36))/2;for(const p of Object.values(positions))p.y+=offset;
  for(const p of Object.values(positions)){p.x*=scale;p.y*=scale;}
  return{root,allowed,visible,depth,positions,width:width*scale,height:height*scale,scale,edges:f.edges.filter(e=>visible.has(e.from)&&visible.has(e.to)),children:id=>f.edges.filter(e=>e.from===id&&allowed.has(e.to))};
}

export function renderGrowth(f,lib,state,options={}){
  const expanded=options.expanded||new Set(['root:'+f.id]),scale=options.fontScale||1,m=growthModel(f,lib,state,expanded,scale),zoom=options.zoom||1;
  const links=m.edges.map(edge=>{const a=m.positions[edge.from],b=m.positions[edge.to],x1=a.x+208*scale,x2=b.x,y1=a.y+56*scale,y2=b.y+56*scale,mid=(x1+x2)/2,label=edge.type==='origin'&&!/同源|词源|历史/.test(edge.label)?'同源 · '+edge.label:edge.label;
    const lines=labelLines(label),h=lines.length===2?42:26;
    return`<path d="M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}" fill="none" stroke="${edge.type==='origin'?'#a49aaa':'#8daa96'}" stroke-width="1.5" ${edge.type==='origin'?'stroke-dasharray="6 5"':''}/><g><title>${esc(label)}</title><rect x="${x2-144*scale}" y="${y2-h*scale/2}" width="${136*scale}" height="${h*scale}" rx="5" fill="#f7f9f4"/><text fill="#506d59" font-size="${14*scale}">${lines.map((line,i)=>`<tspan x="${x2-136*scale}" y="${y2+((lines.length===2?-4:5)+i*18)*scale}">${esc(line)}</tspan>`).join('')}</text></g>`;
  }).join('');
  const nodes=[...m.visible].map(id=>{const root=id===m.root,w=root?null:lib.words[id],p=m.positions[id],children=m.children(id),isOpen=expanded.has(id),status=root?'root':wordStatus(state,lib,id),action=children.length?`data-expand="${esc(id)}" aria-expanded="${isOpen}"`:root?`data-card="root-${esc(f.id)}"`:`data-word="${esc(id)}"`;
    return`<section class="growth-node ${status}" style="left:${p.x}px;top:${p.y}px;width:${208*scale}px;height:${112*scale}px" data-node="${esc(id)}"><button class="growth-node-main" style="height:${82*scale}px;min-height:${82*scale}px" ${action} aria-label="${esc(root?f.label+'词根，'+f.meaning:w.word+'，'+w.pos+'，'+w.meaning)}${children.length?isOpen?'，收起下层':'，展开'+children.length+'个下层词':'，打开完整词卡'}"><strong lang="en">${esc(root?f.label:w.word)}</strong><span>${esc(root?f.meaning:w.pos+' '+w.meaning.split('；')[0])}</span>${children.length?`<i>${isOpen?'−':'+'}</i>`:''}</button><div class="growth-node-foot" style="height:${30*scale}px">${root?`<button data-card="root-${esc(f.id)}">词根知识卡</button>`:`<button data-word="${esc(id)}">完整词卡</button>`}<small>${children.length?children.length+' 个下层联系':root?'开始探索':'末端词条'}</small></div></section>`;
  }).join('');
  return`<section class="family-atlas card growth-atlas"><div class="atlas-toolbar"><div class="atlas-mode-tabs" aria-label="图谱查看方式">${[['target','学习视图'],['full','完整词族'],['growth','逐层展开'],['review','复习视图']].map(([id,label])=>`<button class="${id==='growth'?'active':''}" data-action="atlas-mode" data-id="${id}">${label}</button>`).join('')}</div><span class="meta">已展开 ${m.visible.size-1} / ${m.allowed.size-1} 个词</span><div class="row"><button class="btn small outline" data-action="growth-reset">从词根开始</button><button class="btn small outline" data-action="expand-all">全部展开</button><button class="btn small secondary" data-action="export-atlas">导出词族总览</button></div></div><div class="atlas-guidance"><span>${m.allowed.size===1?'这个目标下暂无已核验词条，可切换“完整词族”查看。':esc(goalLabel(state))+'目标 · 点击 ＋ 展开下层，末端节点打开词卡。'}</span><span>拖动空白处移动 · 可缩放查看</span></div><div class="growth-scroll atlas-scroll" tabindex="0" aria-label="可逐层展开的词族关系网"><div class="atlas-viewport" style="width:${m.width*zoom}px;height:${m.height*zoom}px"><div class="atlas-stage" style="width:${m.width}px;height:${m.height}px;transform:scale(${zoom});transform-origin:0 0"><svg class="atlas-lines" width="${m.width}" height="${m.height}" aria-hidden="true">${links}</svg>${nodes}</div></div></div><div class="atlas-zoom"><button data-action="atlas-zoom-out" aria-label="缩小">−</button><span>${Math.round(zoom*100)}%</span><button data-action="atlas-zoom-in" aria-label="放大">＋</button><button class="growth-readable" data-action="atlas-readable">原始大小</button></div><div class="atlas-legend"><span><i></i>构词或词形联系</span><span><i class="dashed"></i>历史同源，常见义分别学习</span><span>关联层级用于学习，不代表造词时间先后</span></div></section>`;
}
