import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8'));
const before=Date.parse('2026-10-08T15:58:00Z'),after=Date.parse('2026-10-08T16:01:00Z');
const s=E.freshState(),old=E.ensureDay(s,lib,before),family=old.family;
E.startSession(s,lib,'learn',before);
function finishItem(time){const id=s.session.queue[0].id;let n=0;while(!s.session.finished.includes(id)&&n++<20){const q=s.session.queue[0];if(q.phase==='study')E.studyDone(s);E.answer(s,lib,E.studyItem(lib,q.id).word,time);E.continueSession(s,lib,time);}assert.ok(n<20);}
while(s.session.finished.length<3)finishItem(before);
// No intervening render is required to create a correct plan at midnight.
const remaining=new Set(s.session.queue.map(q=>q.id));
while(s.session.queue.length)finishItem(after);
const today=s.days[E.dayKey(after)];assert.equal(today.family,family);assert.equal(today.target,3);assert.equal(today.resumedFrom,E.dayKey(before));assert.deepEqual(new Set(today.newIds),remaining);assert.equal(today.completed.length,3);assert.ok(E.planProgress(today).ready);assert.equal(old.completed.length,3);assert.equal(old.checked,false);
E.finishSession(s);E.checkIn(s,lib,after);assert.equal(E.stats(s,after).learned,6);assert.equal(E.stats(s,after).totalDays,1);assert.equal(old.checked,false);assert.deepEqual(E.validateState(s,lib),s);
const bad=E.freshState();bad.knowledge.constructor={due:0,stage:0};assert.throws(()=>E.validateState(bad,lib),/构词记录/);
const k=E.freshState();assert.equal(E.startSession(k,lib,'knowledge',before,['constructor','toString']),null);
const skip=E.freshState();E.ensureDay(skip,lib,before);E.startSession(skip,lib,'learn',before);const id=skip.session.queue[0].id;E.skipKnown(skip,lib,after);assert.ok(!skip.days[E.dayKey(after)].newIds.includes(id));assert.equal(skip.days[E.dayKey(after)].newIds.length,6);assert.equal(new Set(skip.session.queue.map(q=>q.id)).size,skip.session.queue.length);
console.log('Date continuity and backup checks passed: interrupted family, actual-day checkin, first post-midnight completion, known skip, prototype card rejection.');
