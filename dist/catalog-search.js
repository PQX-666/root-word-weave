const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
export function findWords(lib,query){
  const q=norm(query);if(!q)return [];
  return [...Object.values(lib.words),...Object.values(lib.studyItems||{})].filter(w=>norm(w.word+' '+w.meaning+' '+(w.collocations||[]).join(' ')).includes(q)).sort((a,b)=>{
    const score=w=>norm(w.word)===q?0:norm(w.word).startsWith(q)?1:norm(w.word).includes(q)?2:3;
    return score(a)-score(b)||Number(!!a.isAdditionalSense)-Number(!!b.isAdditionalSense)||a.word.localeCompare(b.word);
  });
}
export function renderWordResults(lib,query){
  const words=findWords(lib,query),shown=words.slice(0,40);
  if(!shown.length)return '';
  return `<section class="catalog-word-results"><div class="row between"><h2>直接查看词卡</h2><span class="meta">${words.length} 个匹配词条${words.length>shown.length?' · 显示前 '+shown.length+' 项':''}</span></div><p class="target-note">查询可查看全词库；学习与复习任务仍按你的目标和掌握情况安排。</p><div class="word-result-grid">${shown.map(w=>`<button class="word-result" data-word="${esc(w.id)}"><span class="row between"><strong lang="en">${esc(w.word)}</strong><small>${w.isAdditionalSense?'拓展义项':w.targets?.includes('cet4')?'四级词目':w.targets?.includes('cet6')?'六级增量':'暂未分级'}</small></span><span class="word-result-definition"><b>${esc(w.pos)}</b> ${esc(w.meaning)}</span><span class="word-result-family">${esc(w.families.map(id=>lib.families.find(f=>f.id===id)?.label||id).join(' / '))} 词族</span></button>`).join('')}</div></section>`;
}
