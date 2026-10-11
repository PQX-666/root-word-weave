import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../dist/engine.js';
import * as M from '../dist/meaning-engine.js';
import {completeDailyMeaning} from '../dist/learning-flow.js';
import {renderMeaningToday} from '../dist/meaning-view.js';
const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-10T10:00:00+08:00'),date=E.dayKey(now),DAY=86400000;
const memory=()=>({due:now-1000,intervalDays:1,first:now-3*DAY,last:now-2*DAY,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false});
function checkedDay(settings={}){
  const s=E.freshState();Object.assign(s.settings,{target:0,goal:'cet4'},settings);
  s.meanings.act=memory();s.meanings.inactive=memory();
  const d=M.ensureMeaningDay(s,lib,now);assert.deepEqual(d.reviewIds,['act']);
  M.startMeaningSession(s,lib,'daily',now);
  const ss=s.meaningSession,q=ss.queue[0];M.revealMeaning(s,ss.id,q.token);M.gradeMeaning(s,lib,'clear',ss.id,q.token,now);
  assert.equal(completeDailyMeaning(s,lib,now),true);M.finishMeaningSession(s);
  assert.equal(d.checked,true);return s;
}
const s=checkedDay(),oldAct=structuredClone(s.meanings.act);
E.configureLearning(s,lib,{goal:'all'},now);M.refreshMeaningPlan(s,lib,now);
assert.equal(s.meaningDays[date].checked,true,'Switching goals preserves attendance');
assert.deepEqual(s.meaningDays[date].reviewIds,['act','inactive']);
assert.deepEqual(M.meaningProgress(s.meaningDays[date],s),{total:2,done:1,newDone:0,reviewDone:1,ready:false});
assert.match(renderMeaningToday(lib,s,now),/继续额外学习/);
assert.match(renderMeaningToday(lib,s,now),/<strong>1<\/strong><span>待复习/);
assert.deepEqual(s.meanings.act,oldAct,'Goal changes do not reschedule completed words');
M.ensureMeaningDay(s,lib,now);assert.equal(s.meaningDays[date].reviewIds.length,2,'No duplicate due entries');
E.configureLearning(s,lib,{goal:'cet4'},now);M.refreshMeaningPlan(s,lib,now);
assert.deepEqual(s.meaningDays[date].reviewIds,['act'],'Hidden, unfinished items leave the visible plan');
assert.equal(M.meaningProgress(s.meaningDays[date],s).ready,true);assert.deepEqual(s.meanings.inactive,memory());
E.configureLearning(s,lib,{goal:'all'},now);M.refreshMeaningPlan(s,lib,now);
M.startMeaningSession(s,lib,'daily',now);assert.deepEqual(s.meaningSession.queue.map(q=>q.id),['inactive']);
const ss=s.meaningSession,q=ss.queue[0];M.revealMeaning(s,ss.id,q.token);M.gradeMeaning(s,lib,'clear',ss.id,q.token,now);
assert.equal(completeDailyMeaning(s,lib,now),false,'Extra review cannot earn a second attendance');
M.finishMeaningSession(s);assert.equal(M.meaningProgress(s.meaningDays[date],s).ready,true);E.validateState(s,lib);
// A known word becoming eligible again uses the same live due refresh.
const known=E.freshState();Object.assign(known.settings,{target:0});known.meanings.act=memory();
E.markKnown(known,lib,'act',now);const d=M.ensureMeaningDay(known,lib,now);d.checked=true;
E.markKnown(known,lib,'act',now);M.refreshMeaningPlan(known,lib,now);
assert.deepEqual(d.reviewIds,['act']);assert.match(renderMeaningToday(lib,known,now),/继续额外学习/);
// Confirmed foundations also become reviewable after the skip is cancelled.
const base=E.freshState();Object.assign(base.settings,{target:0,foundation:'cet4',skipFoundation:true});base.meanings.act=memory();
const bd=M.ensureMeaningDay(base,lib,now);bd.checked=true;assert.deepEqual(bd.reviewIds,[]);
E.configureLearning(base,lib,{skipFoundation:false},now);M.refreshMeaningPlan(base,lib,now);
assert.deepEqual(bd.reviewIds,['act']);assert.equal(bd.checked,true);assert.match(renderMeaningToday(lib,base,now),/继续额外学习/);
E.validateState(base,lib);E.validateState(known,lib);
console.log('Checked-day plan boundary passed: goals, known words, foundations, due visibility, preserved attendance and schedules.');
