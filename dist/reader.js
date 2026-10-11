import {eligible,studyItem,goalLabel} from './engine.js';
import {needsContextAudio} from './word-card.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=s=>[s.settings.goal,s.settings.foundation,s.settings.skipFoundation].join('|');
export function readerIds(s,lib,f){return (f.studyIds||f.wordIds).filter(id=>eligible(s,lib,id));}
export function readerModel(s,lib,fid){
  const f=lib.families.find(f=>f.id===fid);if(!f)return null;
  const ids=readerIds(s,lib,f),p=Object.hasOwn(s.reading||{},fid)?s.reading[fid]:null;
  const same=p?.profile===profile(s),order=f.studyIds||f.wordIds;
  const following=same&&!ids.includes(p.cursor)?ids.find(id=>order.indexOf(id)>=order.indexOf(p.cursor)):null;
  const index=same?Math.max(0,ids.indexOf(following||p.cursor)):0;
  const seen=(same?p.seenIds:[]).filter(id=>ids.includes(id));
  return {f,ids,index,seen,done:!!(same&&(p.completed||!ids.includes(p.cursor))&&seen.length===ids.length&&ids.length),word:studyItem(lib,ids[index])};
}
export function moveReading(s,lib,fid,direction,now=Date.now()){
  const m=readerModel(s,lib,fid);if(!m||!m.ids.length)throw Error('这一组暂无可刷的词。');
  if(!['next','prev','restart'].includes(direction))throw Error('刷词操作不正确。');
  const seen=direction==='restart'?[]:[...new Set([...m.seen,m.ids[m.index]])];
  const finishing=direction==='next'&&m.index===m.ids.length-1,completed=finishing&&seen.length===m.ids.length;
  const index=direction==='restart'?0:direction==='prev'?Math.max(0,m.index-1):finishing&&!completed?m.ids.findIndex(id=>!seen.includes(id)):Math.min(m.ids.length-1,m.index+1);
  s.reading??={};s.reading[fid]={cursor:m.ids[index],seenIds:seen,profile:profile(s),completed,updated:now};
  return readerModel(s,lib,fid);
}
function relations(w,key){const xs=w[key+'Detailed']||(w[key]||[]).map(word=>({word}));return xs.length?xs.map(x=>`<p><strong lang="en">${esc(x.word)}</strong>${x.meaning?' · '+esc(x.meaning):''}${x.usage?`<small>${esc(x.usage)}</small>`:''}</p>`).join(''):'<p class="muted">这个义项没有合适的直接对照词。</p>';}
export function renderReader(lib,s,fid){
  const m=readerModel(s,lib,fid);if(!m)return '<div class="empty"><h1>没有找到这个词族</h1><a href="#read">返回刷词</a></div>';
  const {f,ids,index,word:w}=m,options=lib.families.filter(x=>x.id===fid||readerIds(s,lib,x).length);
  const head=`<header class="reader-head"><div><span class="eyebrow">按词族刷词</span><h1>${esc(f.label)} <small>· ${esc(f.meaning)}</small></h1></div><div class="reader-selector"><label for="reader-family">换个词族</label><select id="reader-family">${options.map(x=>`<option value="${esc(x.id)}" ${x.id===fid?'selected':''}>${esc(x.label)} · ${esc(x.meaning)}</option>`).join('')}</select></div></header><div class="reader-subhead"><span>${esc(goalLabel(s))} · ${s.settings.skipFoundation&&s.settings.foundation!=='none'?'已跳过确认掌握的基础义':'已跳过标记掌握的词'}</span><a href="#family/${esc(fid)}">词族导图</a></div>`;
  if(!ids.length)return `<div class="reader-page">${head}<section class="card reader-empty"><h2>这一组暂时没有可刷的词</h2><p>可以换个词族，或查看完整词族。目标与掌握情况可在“我的”调整。</p><a class="btn" href="#families">换个词族</a></section></div>`;
  if(m.done)return `<div class="reader-page">${head}<section class="card reader-finish"><span class="reader-done">✓</span><h2>这一组刷完了</h2><p>已浏览 ${m.seen.length} 张词卡</p><div class="row"><button class="btn" data-action="reader-restart" data-id="${esc(fid)}">再刷一遍</button><button class="btn outline" data-action="reader-change">换个词族</button></div><p class="meta">浏览进度已保存；主动回忆练习会分别记录学习与复习。</p><a href="#today">去做回忆练习</a></section></div>`;
  const example=w.examples?.[0]||{text:w.example,translation:w.translation},ipa=w.ipa?.uk||w.ipa?.us,accent=w.ipa?.uk?'en-GB':'en-US';
  return `<div class="reader-page" data-reader-family="${esc(fid)}"><div class="reader-shell">${head}<article class="reader-card card" data-reader-word="${esc(w.id)}"><div class="reader-position"><span>${w.isAdditionalSense?'熟词新义':'词族词卡'}</span><span>${index+1} / ${ids.length}</span></div><div class="reader-meter" role="progressbar" aria-label="词卡位置" aria-valuemin="1" aria-valuemax="${ids.length}" aria-valuenow="${index+1}"><span style="width:${(index+1)*100/ids.length}%"></span></div><section class="reader-word"><h2 lang="en">${esc(w.word)}</h2><div class="reader-pronunciation">${ipa?`<span lang="en">${esc(ipa)}</span>`:''}<button class="reader-sound" data-action="speak" data-id="${esc(w.id)}" data-accent="${accent}">${needsContextAudio(w,lib)?'例句朗读':'朗读'}</button></div><div class="reader-definition"><span>${esc(w.pos)}</span><p>${esc(w.meaning)}</p></div></section><section class="reader-association"><span>词根联想</span><strong lang="en">${esc(w.parts.map(p=>p.text).join(' + '))}</strong><p>${esc(w.mnemonic)}</p></section><section class="reader-example"><p lang="en">${esc(example.text)}</p><p>${esc(example.translation)}</p></section><details class="reader-more"><summary>构词解释与更多内容</summary><section><h3>如何理解这个词</h3><p>${esc(w.explanation)}</p><p class="muted">${esc(w.posHint)}</p></section>${(w.examples||[]).slice(1).map(e=>`<section><p lang="en">${esc(e.text)}</p><p class="muted">${esc(e.translation)}</p></section>`).join('')}<section><h3>常见搭配</h3><p lang="en">${esc(w.collocation)}</p></section><section><h3>近义表达</h3>${relations(w,'synonyms')}</section><section><h3>反义表达</h3>${relations(w,'antonyms')}</section><button class="btn small outline" data-word="${esc(w.id)}">打开完整词卡</button></details></article><div class="reader-controls"><button class="btn outline reader-prev" data-action="reader-prev" data-id="${esc(fid)}" ${index===0?'disabled':''}>上一个</button><button class="btn reader-next" data-action="reader-next" data-id="${esc(fid)}">${index===ids.length-1?'完成本组浏览':'下一个'}</button></div><p class="reader-note">点“下一个”继续看词，浏览进度自动保存。</p></div></div>`;
}
