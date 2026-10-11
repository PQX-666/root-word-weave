import * as M from './meaning-engine.js';
import {dayKey} from './engine.js';

// Attendance waits for the daily plan and its reinforcement queue. Scheduling
// stays in meaning-engine, independent of this presentation flow.
export function completeDailyMeaning(s,lib,now=Date.now()){
  const d=M.ensureMeaningDay(s,lib,now);
  if(d.checked||!M.meaningProgress(d,s).ready)return false;
  M.checkMeaningIn(s,lib,now);return true;
}
export function meaningResult(s,lib,now=Date.now()){
  const d=M.ensureMeaningDay(s,lib,now),p=M.meaningProgress(d,s),ss=s.meaningSession;
  const daily=p.ready,ids=daily?d.completed:ss?.finished||[],start=daily?Date.parse(dayKey(now)+'T00:00:00+08:00'):ss?.started||now;
  const events=(s.meaningEvents||[]).filter(e=>e.at>=start&&ids.includes(e.item));
  const newCount=daily?p.newDone:ids.filter(id=>events.some(e=>e.item===id&&e.new&&!e.reinforcement)).length;
  return {daily,newCount,reviewCount:daily?p.reviewDone:ids.length-newCount,weak:ids.filter(id=>events.some(e=>e.item===id&&e.grade!=='clear')).length,next:ids.length?Math.min(...ids.map(id=>s.meanings[id]?.due||Infinity)):null};
}

export function meaningPracticeDays(s){
  return Object.values(s.meaningDays||{}).filter(d=>d.completed.length>0).length;
}

// Encouragement describes the saved recall event, never inferred ability.
export function meaningFeedback(s){
  if(s.settings.encouragement==='plain')return null;
  const e=s.meaningEvents?.at(-1);if(!e)return null;
  if(e.aided&&e.requestedGrade==='clear')return '这次借助了提示，已如实记下。';
  if(e.grade==='forgot')return '没关系，接着巩固。';
  if(e.grade==='fuzzy')return '补全这次没想起的部分。';
  const previous=s.meaningEvents.slice(0,-1).findLast(x=>x.item===e.item&&!x.reinforcement);
  if(!e.new&&!e.reinforcement&&!e.aided&&e.elapsedDays>=1&&previous&&previous.grade!=='clear')return '上次需要巩固，这次独立想对了。';
  return '这次想对了，继续保持。';
}
