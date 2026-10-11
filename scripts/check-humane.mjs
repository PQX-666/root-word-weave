import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../dist/engine.js';
import * as M from '../dist/meaning-engine.js';
import {completeDailyMeaning,meaningFeedback,meaningPracticeDays} from '../dist/learning-flow.js';

const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-10T02:00:00Z'),DAY=86400000;
const clone=s=>JSON.parse(JSON.stringify(s));
const record=(at=now)=>({first:at-DAY*4,last:at-DAY*2,due:at-1000,intervalDays:2,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false});
function grade(s,kind='clear',at=now){
  const ss=s.meaningSession,q=ss.queue[0];
  assert.ok(M.revealMeaning(s,ss.id,q.token));
  const result=M.gradeMeaning(s,lib,kind,ss.id,q.token,at);
  assert.ok(result);E.validateState(s,lib);return result;
}
function finishRound(s,at=now){
  let turns=0;while(s.meaningSession.queue.length){assert.ok(++turns<=s.meaningSession.total*3);grade(s,'clear',at);}
}
function seedDue(s,n=7){const ids=Object.keys(lib.words).slice(0,n);for(const id of ids)s.meanings[id]=record();return ids;}

// A small round is a subset of the complete plan, not a smaller daily quota.
const partial=E.freshState();partial.settings.target=12;
const dueIds=seedDue(partial),plan=M.ensureMeaningDay(partial,lib,now),planBefore=clone(plan),scheduleBefore=clone(partial.meanings),targetBefore=partial.settings.target;
const normal=clone(partial);M.startMeaningSession(normal,lib,'daily',now);
M.startMeaningSession(partial,lib,'light',now);
assert.equal(partial.meaningSession.mode,'light');assert.equal(partial.meaningSession.total,5);
assert.deepEqual(partial.meaningSession.queue.map(q=>q.id),normal.meaningSession.queue.slice(0,5).map(q=>q.id));
assert.ok(partial.meaningSession.queue.every(q=>!q.new),'Due items must precede any new items');
assert.deepEqual(plan,planBefore);assert.deepEqual(partial.meanings,scheduleBefore);assert.equal(partial.settings.target,targetBefore);
E.validateState(partial,lib);
for(let i=0;i<5;i++){
  const id=partial.meaningSession.queue[0].id;assert.equal(id,normal.meaningSession.queue[0].id);
  const small=grade(partial),full=grade(normal);assert.deepEqual(small,full);
}
assert.deepEqual(partial.meanings,normal.meanings,'Light mode must use the same grading schedule');
for(const id of dueIds.slice(5))assert.deepEqual(partial.meanings[id],scheduleBefore[id],'Unpractised due dates must stay unchanged');
assert.equal(completeDailyMeaning(partial,lib,now),false);assert.equal(plan.checked,false);
assert.deepEqual(plan.newIds,planBefore.newIds);assert.deepEqual(plan.reviewIds,planBefore.reviewIds);
M.finishMeaningSession(partial);assert.equal(partial.meaningSession,null);
assert.equal(M.meaningProgress(plan,partial).done,5);assert.equal(M.meaningProgress(plan,partial).ready,false);
M.startMeaningSession(partial,lib,'daily',now);assert.equal(partial.meaningSession.queue[0].id,dueIds[5],'Ending a small round must preserve the remaining due work');

// All initial items can be graded while a reinforcement card still blocks attendance.
const full=E.freshState();full.settings.target=5;M.startMeaningSession(full,lib,'light',now);
assert.equal(full.meaningSession.total,5);
grade(full);grade(full);grade(full);grade(full,'forgot');grade(full);
assert.equal(full.meaningSession.finished.length,5);assert.equal(full.meaningSession.queue.length,1);
assert.equal(full.meaningSession.queue[0].reinforcement,true);
assert.equal(completeDailyMeaning(full,lib,now),false);
const initialOutcomes=clone(full.meaningSession.outcomes);grade(full);
assert.deepEqual(full.meaningSession.outcomes,initialOutcomes,'Later success must preserve the earlier weak outcome');
assert.equal(completeDailyMeaning(full,lib,now),true);assert.equal(completeDailyMeaning(full,lib,now),false);
assert.equal(full.meaningDays[E.dayKey(now)].checked,true);

// The secondary route may continue the complete plan; existing sessions are never trimmed.
const existing=E.freshState();existing.settings.target=12;M.startMeaningSession(existing,lib,'daily',now);grade(existing,'forgot');
const activeBefore=clone(existing.meaningSession),same=existing.meaningSession;
assert.equal(M.startMeaningSession(existing,lib,'light',now),same);
assert.deepEqual(existing.meaningSession,activeBefore);
assert.ok(existing.meaningSession.queue.some(q=>q.reinforcement));assert.ok(existing.meaningSession.total>5);
E.validateState(existing,lib);

// Zero new-word quota still allows a small due-only round, but no empty attendance.
const zero=E.freshState();zero.settings.target=0;assert.equal(M.startMeaningSession(zero,lib,'light',now),null);
assert.equal(zero.meaningSession,null);assert.equal(completeDailyMeaning(zero,lib,now),false);
seedDue(zero);M.startMeaningSession(zero,lib,'light',now);assert.equal(zero.meaningSession.total,5);
assert.ok(zero.meaningSession.queue.every(q=>!q.new));finishRound(zero);assert.equal(completeDailyMeaning(zero,lib,now),false);

// Small rounds coexist with the legacy optional spelling session without rewriting it.
const optional=E.freshState();optional.settings.target=5;E.startSession(optional,lib,'learn',now,['act']);
const legacyBefore=JSON.stringify({session:optional.session,days:optional.days,words:optional.words,events:optional.events});
M.startMeaningSession(optional,lib,'light',now);finishRound(optional);
assert.equal(completeDailyMeaning(optional,lib,now),true);
assert.equal(JSON.stringify({session:optional.session,days:optional.days,words:optional.words,events:optional.events}),legacyBefore);

// Checked attendance remains intact when the user explicitly adds more practice.
M.finishMeaningSession(full);M.startMeaningSession(full,lib,'family',now+1000,'spect');
const extraBefore=clone(full.meaningSession);assert.equal(full.meaningDays[E.dayKey(now)].checked,true);
M.startMeaningSession(full,lib,'light',now+1000);assert.deepEqual(full.meaningSession,extraBefore);
assert.equal(completeDailyMeaning(full,lib,now+1000),false);assert.equal(full.meaningDays[E.dayKey(now)].checked,true);

// Midnight preserves the original full plan, and scores belong to their actual day.
const late=Date.parse('2026-10-10T15:59:00Z'),after=late+120000,cross=E.freshState();cross.settings.target=12;
M.startMeaningSession(cross,lib,'light',late);const originalIds=[...cross.meaningDays[E.dayKey(late)].newIds];
grade(cross,'clear',late);const carriedIds=cross.meaningSession.queue.map(q=>q.id);
const nextDay=M.ensureMeaningDay(cross,lib,after);
assert.equal(cross.meaningSession.mode,'light');assert.deepEqual(nextDay.newIds,carriedIds);
finishRound(cross,after);assert.deepEqual(cross.meaningDays[E.dayKey(late)].newIds,originalIds);
assert.equal(cross.meaningDays[E.dayKey(late)].completed.length,1);assert.equal(cross.meaningDays[E.dayKey(late)].checked,false);
assert.equal(M.meaningProgress(nextDay,cross).newDone,4);assert.equal(completeDailyMeaning(cross,lib,after),false);
assert.ok(nextDay.reviewIds.some(id=>!nextDay.completed.includes(id)),'The previous day\'s now-due card must still require review');
E.validateState(cross,lib);

// The persisted preference defaults for old backups and rejects malformed styles.
assert.equal(E.freshState().settings.encouragement,'warm');
const old=E.freshState();delete old.settings.encouragement;for(const key of ['meanings','meaningDays','meaningEvents','meaningSession'])delete old[key];
const restored=E.validateState(old,lib);assert.equal(restored.settings.encouragement,'warm');assert.equal(restored.meaningSession,null);
const smallBackup=E.freshState();smallBackup.settings.target=12;M.startMeaningSession(smallBackup,lib,'light',now);
assert.equal(E.validateState(clone(smallBackup),lib).meaningSession.mode,'light');
for(const badStyle of ['cheerful','',null,[],1]){const bad=E.freshState();bad.settings.encouragement=badStyle;assert.throws(()=>E.validateState(bad,lib));}
const oversized=E.freshState();oversized.settings.target=12;M.startMeaningSession(oversized,lib,'daily',now);oversized.meaningSession.mode='light';
assert.throws(()=>E.validateState(oversized,lib),'A light backup must not exceed five initial items');
const inconsistent=clone(smallBackup);inconsistent.meaningSession.total=4;assert.throws(()=>E.validateState(inconsistent,lib));
const unknownMode=clone(smallBackup);unknownMode.meaningSession.mode='tiny';assert.throws(()=>E.validateState(unknownMode,lib));

// Only verified delayed independent improvement may receive the specific progress message.
const promotion='上次需要巩固，这次独立想对了。';
const event=(grade,overrides={})=>({id:crypto.randomUUID(),item:'act',family:'act',grade,requestedGrade:grade,aided:false,at:now,elapsedDays:2,new:false,reinforcement:false,...overrides});
const feedbackState=(events,style='warm')=>{const s=E.freshState();s.settings.encouragement=style;s.meaningEvents=events;return s;};
assert.equal(meaningFeedback(feedbackState([])),null);
const prior=event('fuzzy',{at:now-DAY*2}),current=event('clear');
assert.equal(meaningFeedback(feedbackState([prior,current])),promotion);
assert.equal(meaningFeedback(feedbackState([prior,current],'plain')),null);
for(const change of [{aided:true,grade:'fuzzy',requestedGrade:'clear'},{new:true},{reinforcement:true},{elapsedDays:.5}]){
  const message=meaningFeedback(feedbackState([prior,event('clear',change)]));assert.notEqual(message,promotion);
  if(change.aided)assert.doesNotMatch(String(message||''),/独立想对/);
}
assert.notEqual(meaningFeedback(feedbackState([event('clear',{at:now-DAY*2}),current])),promotion);
assert.notEqual(meaningFeedback(feedbackState([event('fuzzy',{item:'actor'}),current])),promotion);
assert.notEqual(meaningFeedback(feedbackState([prior,event('clear',{at:now-DAY}),event('forgot',{item:'actor'}),current])),promotion,'The closest previous event for this item must determine the comparison');

// Practice-day feedback counts actual meaning scores rather than check-ins or total cards.
const dates=E.freshState();const first=M.ensureMeaningDay(dates,lib,now);first.completed=['act','action'];first.checked=false;
assert.equal(meaningPracticeDays(dates),1);
M.ensureMeaningDay(dates,lib,now+DAY);assert.equal(meaningPracticeDays(dates),1);
const third=M.ensureMeaningDay(dates,lib,now+DAY*2);third.completed=['act'];third.checked=true;
E.ensureDay(dates,lib,now-DAY);dates.days[E.dayKey(now-DAY)].checked=true;
assert.equal(meaningPracticeDays(dates),2);

console.log('Humane state checks passed: light subsets and due-first, complete-plan attendance and reinforcement, unchanged schedule/history, zero quota, midnight carry, existing session preservation, legacy backups and preference validation, evidence-based feedback and actual practice days.');
