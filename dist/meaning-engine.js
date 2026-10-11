// Word-meaning recall is independent of spelling practice and passive browsing.
import {studyItem,canonicalId,eligible,dayKey} from './engine.js';
const DAY=86400000,GRADES=['forgot','fuzzy','clear'];
const own=(box,id)=>Object.hasOwn(box||{},id)?box[id]:undefined;
const unique=xs=>[...new Set(xs)];
const familyIds=f=>f.studyIds||f.wordIds;
const nextDay=(now,days)=>Date.parse(dayKey(now)+'T00:00:00+08:00')+days*DAY;
export function meaningCandidates(s,lib,f){return familyIds(f).filter(id=>eligible(s,lib,id)&&!own(s.meanings,id));}
export function dueMeanings(s,lib,now=Date.now()){return Object.keys(s.meanings||{}).filter(id=>eligible(s,lib,id)&&s.meanings[id].due<=now).sort((a,b)=>s.meanings[a].due-s.meanings[b].due);}
export function meaningGroups(s,lib,now=Date.now()){
  const preferred=s.meaningDays?.[dayKey(now)]?.family,groups=new Map();
  for(const id of dueMeanings(s,lib,now)){const fs=studyItem(lib,id).families,fid=fs.includes(preferred)?preferred:fs[0];if(!groups.has(fid))groups.set(fid,{family:fid,ids:[]});groups.get(fid).ids.push(id);}
  return [...groups.values()];
}
export function ensureMeaningDay(s,lib,now=Date.now()){
  s.meanings??={};s.meaningDays??={};s.meaningEvents??=[];s.meaningSession??=null;
  const date=dayKey(now),active=s.meaningSession,carry=active&&dayKey(active.started)!==date?active.queue:[];
  let d=own(s.meaningDays,date);
  if(d){if(!active?.queue.length){d.newIds=d.newIds.filter(id=>d.completed.includes(id)||eligible(s,lib,id));d.reviewIds=d.reviewIds.filter(id=>d.completed.includes(id)||eligible(s,lib,id));}d.reviewIds=unique([...d.reviewIds,...dueMeanings(s,lib,now).filter(id=>!d.completed.includes(id))]);return d;}
  const viable=lib.families.filter(f=>meaningCandidates(s,lib,f).length),previous=Object.values(s.meaningDays).map(x=>x.family),legacyFamily=s.days?.[date]?.family;
  const f=lib.families.find(f=>f.id===carry.find(q=>q.new&&!q.reinforcement)?.family)||viable.find(f=>f.id===legacyFamily)||viable.find(f=>!previous.includes(f.id))||viable[0]||lib.families[0];
  const carryNew=unique(carry.filter(q=>q.new&&!q.reinforcement&&eligible(s,lib,q.id)).map(q=>q.id));
  return s.meaningDays[date]={family:f.id,requestedTarget:s.settings.target,newIds:carry.length?carryNew:meaningCandidates(s,lib,f).slice(0,s.settings.target),reviewIds:unique([...dueMeanings(s,lib,now),...carry.filter(q=>!q.new||q.reinforcement).map(q=>q.id)]),completed:[],checked:false,...(carry.length?{resumedFrom:dayKey(active.started)}:{})};
}
export function chooseMeaningFamily(s,lib,fid,now=Date.now()){
  const d=ensureMeaningDay(s,lib,now),f=lib.families.find(f=>f.id===fid);if(!f)throw Error('词族不存在。');
  if(s.meaningSession?.queue.length||d.completed.length)throw Error('先完成当前词族，再选择下一组。');
  d.family=fid;d.newIds=meaningCandidates(s,lib,f).slice(0,d.requestedTarget);return d;
}
export function refreshMeaningPlan(s,lib,now=Date.now()){
  if(s.meaningSession?.queue.length)throw Error('先完成当前词义回忆，再调整学习目标。');
  const d=ensureMeaningDay(s,lib,now);if(d.checked)return d;
  let f=lib.families.find(f=>f.id===d.family);const completedNew=d.newIds.filter(id=>d.completed.includes(id));
  if(!completedNew.length&&!meaningCandidates(s,lib,f).length)f=lib.families.find(f=>meaningCandidates(s,lib,f).length)||f;
  d.family=f.id;d.newIds=unique([...completedNew,...meaningCandidates(s,lib,f).slice(0,Math.max(0,d.requestedTarget-completedNew.length))]);
  d.reviewIds=unique([...d.reviewIds.filter(id=>d.completed.includes(id)),...dueMeanings(s,lib,now)]);return d;
}
export function meaningProgress(d,s){const ids=unique([...d.newIds,...d.reviewIds]),done=ids.filter(id=>d.completed.includes(id));return {total:ids.length,done:done.length,newDone:d.newIds.filter(id=>d.completed.includes(id)).length,reviewDone:d.reviewIds.filter(id=>d.completed.includes(id)).length,ready:ids.length>0&&done.length===ids.length&&!s?.meaningSession?.queue.length};}
export function startMeaningSession(s,lib,mode='daily',now=Date.now(),fid){
  if(s.meaningSession)return s.meaningSession;
  if(!['daily','family','review','light'].includes(mode))throw Error('学习模式不正确。');
  const d=ensureMeaningDay(s,lib,now);let fresh=d.newIds.filter(id=>!d.completed.includes(id)&&eligible(s,lib,id)&&!own(s.meanings,id));
  if(mode==='family'){
    const f=lib.families.find(f=>f.id===fid);if(!f)throw Error('词族不存在。');
    fresh=meaningCandidates(s,lib,f).slice(0,d.requestedTarget);
    if(!d.completed.length){d.family=fid;d.newIds=fresh;}else d.newIds=unique([...d.newIds,...fresh]);
  }
  const due=meaningGroups(s,lib,now).filter(g=>mode!=='review'||!fid||g.family===fid).flatMap(g=>g.ids),chosen=unique([...due,...(mode==='review'?[]:fresh)]).slice(0,mode==='light'?5:100);
  if(!chosen.length)return null;
  d.reviewIds=unique([...d.reviewIds,...due]);
  s.meaningSession={id:crypto.randomUUID(),started:now,mode,total:chosen.length,finished:[],outcomes:{},queue:chosen.map(id=>{const w=studyItem(lib,id);return {id,family:w.families.includes(d.family)?d.family:w.families[0],token:crypto.randomUUID(),phase:'hidden',aided:false,new:!own(s.meanings,id),reinforcement:false,repeats:0,roundGrade:null,intervalDays:null,contextIndex:(own(s.meanings,id)?.repetitions||0)%(w.examples?.length||1)};})};return s.meaningSession;
}
export function revealMeaning(s,sessionId,token){const q=s.meaningSession?.queue[0];if(s.meaningSession?.id!==sessionId||q?.token!==token||q.phase!=='hidden')return false;q.phase='revealed';return true;}
export function aidMeaning(s){const q=s.meaningSession?.queue[0];if(!q||q.phase!=='hidden'||q.aided)return false;q.aided=true;return true;}
export function predictMeaning(s,id,grade,now=Date.now(),q=s.meaningSession?.queue[0]){
  if(!GRADES.includes(grade))throw Error('评分不正确。');
  const effective=q?.aided&&grade==='clear'?'fuzzy':grade,old=own(s.meanings,id),elapsed=old?Math.max(0,(now-old.last)/DAY):0;
  let days=1;
  if(q?.reinforcement)days=effective==='forgot'?1:Math.min(q.intervalDays,old?.intervalDays||q.intervalDays);
  else if(old&&effective==='clear')days=dayKey(old.last)===dayKey(now)||elapsed<.5?old.intervalDays:Math.round(Math.max(old.intervalDays,Math.min(elapsed,old.intervalDays*1.5))*2);
  else if(old&&effective==='fuzzy')days=Math.min(3,Math.round(old.intervalDays*.5));
  days=Math.max(1,Math.min(120,days||1));
  return {grade:effective,intervalDays:days,due:nextDay(now,days),elapsedDays:elapsed};
}
export function gradeMeaning(s,lib,grade,sessionId,token,now=Date.now()){
  const ss=s.meaningSession,q=ss?.queue[0];if(!ss||ss.id!==sessionId||q?.token!==token||q.phase!=='revealed')return null;
  if(!GRADES.includes(grade))throw Error('评分不正确。');
  const d=ensureMeaningDay(s,lib,now),p=predictMeaning(s,q.id,grade,now,q),old=own(s.meanings,q.id);
  ss.lastFamily=q.family;
  s.meanings[q.id]={due:p.due,intervalDays:p.intervalDays,first:old?.first??now,last:now,repetitions:(old?.repetitions||0)+1,lapses:(old?.lapses||0)+(p.grade==='forgot'?1:0),lastGrade:p.grade,lastAided:q.aided};
  const initial=!q.reinforcement;
  ss.outcomes[q.id]=GRADES[Math.min(GRADES.indexOf(ss.outcomes[q.id]??p.grade),GRADES.indexOf(p.grade))];
  if(initial){ss.finished=unique([...ss.finished,q.id]);q.roundGrade=p.grade;}q.intervalDays=p.intervalDays;
  d.completed=unique([...d.completed,q.id]);
  if(!d.newIds.includes(q.id)&&!d.reviewIds.includes(q.id))d.reviewIds.push(q.id);
  s.meaningEvents.push({id:token,item:q.id,family:q.family,grade:p.grade,requestedGrade:grade,aided:q.aided,at:now,elapsedDays:p.elapsedDays,new:q.new&&initial,reinforcement:q.reinforcement});s.meaningEvents=s.meaningEvents.slice(-3000);
  ss.queue.shift();
  // Limited practice after other cards. Immediate repetition at the end is avoided.
  if(p.grade!=='clear'&&q.repeats<2&&ss.queue.length){q.repeats++;q.reinforcement=true;q.phase='hidden';q.token=crypto.randomUUID();ss.queue.splice(Math.min(3,ss.queue.length),0,q);}
  return p;
}
export function finishMeaningSession(s){if(s.meaningSession?.queue.length)throw Error('本轮还没有完成，可以离开页面后再继续。');const ss=s.meaningSession;s.meaningSession=null;return ss;}
export function checkMeaningIn(s,lib,now=Date.now()){const d=ensureMeaningDay(s,lib,now);if(!meaningProgress(d,s).ready)throw Error('完成今日的新词和到期回忆后即可打卡。');d.checked=true;return dayKey(now);}
export function meaningStats(s){const entries=Object.entries(s.meanings||{}),delayed=(s.meaningEvents||[]).filter(e=>!e.new&&!e.reinforcement&&e.elapsedDays>=1);return {words:unique(entries.map(([id])=>canonicalId(id))).length,items:entries.length,delayed:delayed.length,clear:delayed.filter(e=>e.grade==='clear').length};}

export function validateMeaningState(s,lib){
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=x=>Number.isFinite(x)&&x>=0&&x<=8.64e15,integer=x=>Number.isInteger(x)&&x>=0&&x<=1e6,valid=id=>typeof id==='string'&&!!studyItem(lib,id),token=x=>typeof x==='string'&&x.length>=12&&x.length<=80;
  const array=xs=>Array.isArray(xs)&&xs.length<=2000&&new Set(xs).size===xs.length&&xs.every(valid),fail=()=>{throw Error('词义回忆记录不正确。');};
  if(s.meanings===undefined)s.meanings={};if(s.meaningDays===undefined)s.meaningDays={};if(s.meaningEvents===undefined)s.meaningEvents=[];if(s.meaningSession===undefined)s.meaningSession=null;
  if(!object(s.meanings)||!object(s.meaningDays)||!Array.isArray(s.meaningEvents)||s.meaningEvents.length>3000)fail();
  for(const [id,p]of Object.entries(s.meanings))if(!valid(id)||!object(p)||!finite(p.due)||!finite(p.first)||!finite(p.last)||p.first>p.last||!Number.isInteger(p.intervalDays)||p.intervalDays<1||p.intervalDays>120||!integer(p.repetitions)||p.repetitions<1||!integer(p.lapses)||p.lapses>p.repetitions||!GRADES.includes(p.lastGrade)||typeof p.lastAided!=='boolean')fail();
  const family=id=>lib.families.find(f=>f.id===id),belongs=(fid,id)=>!!family(fid)&&familyIds(family(fid)).includes(id);
  for(const [date,d]of Object.entries(s.meaningDays))if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!object(d)||!family(d.family)||!integer(d.requestedTarget)||d.requestedTarget>50||!array(d.newIds)||!array(d.reviewIds)||!array(d.completed)||typeof d.checked!=='boolean')fail();
  for(const e of s.meaningEvents)if(!object(e)||!token(e.id)||!valid(e.item)||!belongs(e.family,e.item)||!GRADES.includes(e.grade)||!GRADES.includes(e.requestedGrade)||typeof e.aided!=='boolean'||!finite(e.at)||!finite(e.elapsedDays)||typeof e.new!=='boolean'||typeof e.reinforcement!=='boolean')fail();
  if(new Set(s.meaningEvents.map(e=>e.id)).size!==s.meaningEvents.length)fail();
  const ss=s.meaningSession;if(ss!==null){
    if(!object(ss)||!token(ss.id)||!finite(ss.started)||!['daily','family','review','light'].includes(ss.mode)||!integer(ss.total)||ss.total<1||ss.total>(ss.mode==='light'?5:100)||!array(ss.finished)||ss.finished.length>ss.total||!object(ss.outcomes)||!Array.isArray(ss.queue)||ss.queue.length>100)fail();
    if(ss.lastFamily!==undefined&&!family(ss.lastFamily)||ss.finished.some(id=>!own(s.meanings,id)))fail();
    for(const q of ss.queue)if(!object(q)||!valid(q.id)||!belongs(q.family,q.id)||!token(q.token)||!['hidden','revealed'].includes(q.phase)||typeof q.aided!=='boolean'||typeof q.new!=='boolean'||typeof q.reinforcement!=='boolean'||!integer(q.repeats)||q.repeats>2||!integer(q.contextIndex)||q.contextIndex>10||!(q.roundGrade===null||GRADES.includes(q.roundGrade))||!(q.intervalDays===null||Number.isInteger(q.intervalDays)&&q.intervalDays>=1&&q.intervalDays<=120)||q.reinforcement&&(q.repeats<1||q.roundGrade===null||q.intervalDays===null))fail();
    for(const q of ss.queue)if(q.reinforcement?(!ss.finished.includes(q.id)||!own(s.meanings,q.id)):(ss.finished.includes(q.id)||q.repeats!==0||q.roundGrade!==null||q.intervalDays!==null))fail();
    if(new Set(ss.queue.map(q=>q.id)).size!==ss.queue.length||new Set(ss.queue.map(q=>q.token)).size!==ss.queue.length||unique([...ss.finished,...ss.queue.map(q=>q.id)]).length!==ss.total)fail();
    for(const [id,grade]of Object.entries(ss.outcomes))if(!ss.finished.includes(id)||!GRADES.includes(grade))fail();
    if(Object.keys(ss.outcomes).length!==ss.finished.length)fail();
  }
  return s;
}
