import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../dist/engine.js';

const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-11T02:00:00Z'),clone=s=>JSON.parse(JSON.stringify(s));
const create=(mode='knowledge',ids=['root-act'])=>{const s=E.freshState();E.startSession(s,lib,mode,now,ids);return s;};
const valid=s=>E.validateState(s,lib);
const invalid=(base,damage,label)=>{const s=clone(base);damage(s);assert.throws(()=>valid(s),/练习进度不正确/,label);};

// Normal exports preserve both the study phase and a pending graded answer.
const knowledge=create();assert.deepEqual(valid(knowledge),clone(knowledge));
E.studyDone(knowledge);E.answer(knowledge,lib,lib.cards['root-act'].question.answer,now);
assert.equal(knowledge.session.feedback.done,false);assert.deepEqual(valid(knowledge),clone(knowledge));
const resumed=valid(knowledge);E.continueSession(resumed,lib,now);
assert.equal(resumed.session.queue.length,1);assert.equal(resumed.session.feedback,null);
E.answer(resumed,lib,lib.cards['root-act'].question.answer,now);E.continueSession(resumed,lib,now);
assert.equal(resumed.session.queue.length,0);assert.equal(resumed.session.total,1);assert.deepEqual(valid(resumed),clone(resumed));
const knowledgeString=create();E.studyDone(knowledgeString);E.answer(knowledgeString,lib,String(lib.cards['root-act'].question.answer),now);
assert.deepEqual(valid(knowledgeString),clone(knowledgeString),'Browser knowledge attempts are strings while older tool exports may contain numbers');
const wrongKnowledge=create();E.studyDone(wrongKnowledge);E.answer(wrongKnowledge,lib,String((lib.cards['root-act'].question.answer+1)%4),now);
assert.equal(wrongKnowledge.session.feedback.correct,false);assert.deepEqual(valid(wrongKnowledge),clone(wrongKnowledge));

const word=create('learn',['act','action']);E.studyDone(word);E.answer(word,lib,'incorrect',now);
assert.deepEqual(valid(word),clone(word));const wordResume=valid(word);E.continueSession(wordResume,lib,now);
assert.ok(wordResume.session.queue.some(q=>q.id==='act'));assert.deepEqual(valid(wordResume),clone(wordResume));
const review=E.freshState();review.words.act={status:'review',stage:1,due:now-1,repetitions:2};E.startSession(review,lib,'review',now);
E.answer(review,lib,'act',now);assert.equal(review.session.feedback.done,true);assert.deepEqual(valid(review),clone(review));
E.continueSession(review,lib,now);assert.deepEqual(valid(review),clone(review));
assert.deepEqual(valid(create('pending',['act'])).session.mode,'pending');

// Missing/null knowledge orders are old renderer-compatible exports, not errors.
for(const order of [undefined,null]){
  const old=create();E.studyDone(old);if(order===undefined)delete old.session.queue[0].optionOrder;else old.session.queue[0].optionOrder=null;
  delete old.session.feedback;
  const restored=valid(old),q=restored.session.queue[0];
  assert.deepEqual(q.optionOrder,[0,1,2,3]);assert.equal(restored.session.feedback,null);
  assert.ok(q.optionOrder.map(i=>lib.cards[q.id].question.options[i]).every(x=>typeof x==='string'));
  E.answer(restored,lib,lib.cards[q.id].question.answer,now);E.continueSession(restored,lib,now);valid(restored);
  assert.equal(old.session.queue[0].optionOrder,order,'Validation must not mutate the imported input');
  const oldFeedback=clone(knowledgeString);if(order===undefined)delete oldFeedback.session.queue[0].optionOrder;else oldFeedback.session.queue[0].optionOrder=null;
  const feedbackRestore=valid(oldFeedback);assert.deepEqual(feedbackRestore.session.feedback,oldFeedback.session.feedback);
  E.continueSession(feedbackRestore,lib,now);assert.equal(feedbackRestore.session.queue[0].attempts,1);
  E.answer(feedbackRestore,lib,String(lib.cards['root-act'].question.answer),now);E.continueSession(feedbackRestore,lib,now);
  assert.equal(feedbackRestore.session.queue.length,0);assert.equal(feedbackRestore.knowledge['root-act'].repetitions,1);
  assert.equal(feedbackRestore.knowledge['root-act'].due,now+86400000);valid(feedbackRestore);
}

// Refills from known-word skipping historically omitted the unused word order.
const skipped=E.freshState();E.startSession(skipped,lib,'learn',now);E.skipKnown(skipped,lib,now);
assert.ok(skipped.session.queue.some(q=>q.optionOrder===undefined));assert.deepEqual(valid(skipped),clone(skipped));
const allKnown=E.freshState();allKnown.settings.target=1;
for(const id of new Set([...Object.keys(lib.words),...Object.keys(lib.studyItems)]))if(id!=='act')allKnown.words[id]={status:'known',stage:0,due:0,repetitions:0};
E.startSession(allKnown,lib,'learn',now);E.skipKnown(allKnown,lib,now);
assert.equal(allKnown.session.total,0);assert.equal(allKnown.session.queue.length,0);assert.deepEqual(valid(allKnown),clone(allKnown));

// The original crash and malformed permutations are rejected before persistence.
const question=create();E.studyDone(question);
for(const order of ['broken',{},true,0,[],[0,1,2],[0,1,2,3,4],[0,1,1,3],[-1,0,1,2],[0,1,2,4],['0',1,2,3],[0,1,2,NaN]]){
  invalid(question,s=>s.session.queue[0].optionOrder=order,'Invalid option order '+JSON.stringify(order));
}
invalid(word,s=>s.session.queue[0].optionOrder='broken','Malformed order should also be rejected on word backups');

for(const [label,damage] of [
  ['non-object session',s=>s.session=[]],['false session',s=>s.session=false],
  ['missing mode',s=>delete s.session.mode],['invalid mode',s=>s.session.mode='other'],
  ['invalid session ID',s=>s.session.id=''],['missing start',s=>delete s.session.started],['invalid start',s=>s.session.started=-1],
  ['missing total',s=>delete s.session.total],['fractional total',s=>s.session.total=1.5],['inconsistent total',s=>s.session.total++],
  ['invalid queue',s=>s.session.queue={}],['duplicate queue item',s=>{s.session.queue.push(clone(s.session.queue[0]));s.session.total++;}],
  ['invalid finished item',s=>{s.session.finished.push('not-a-word');s.session.total++;}],
  ['finished overlaps queue',s=>{s.session.finished.push(s.session.queue[0].id);s.session.total++;}],
  ['wrong item kind',s=>s.session.queue[0].kind='word'],['invalid phase',s=>s.session.queue[0].phase='answer'],
  ['missing attempts',s=>delete s.session.queue[0].attempts],['invalid attempts',s=>s.session.queue[0].attempts=-1],
  ['invalid streak',s=>s.session.queue[0].streak=2],['missing new flag',s=>delete s.session.queue[0].new],
  ['invalid aided flag',s=>s.session.queue[0].aided='yes'],['invalid failed flag',s=>s.session.queue[0].failed=1],
  ['unexpected knowledge family',s=>s.session.queue[0].family='act']
])invalid(question,damage,label);
invalid(word,s=>s.session.queue[0].family='port','Word family must actually contain the item');

for(const [label,damage] of [
  ['non-object feedback',s=>s.session.feedback=[]],['feedback for another item',s=>s.session.feedback.id='action'],
  ['invalid correct flag',s=>s.session.feedback.correct='true'],['invalid done flag',s=>s.session.feedback.done=1],
  ['incorrect completed feedback',s=>{s.session.feedback.correct=false;s.session.feedback.done=true;}],
  ['invalid feedback event',s=>s.session.feedback.event=''],['missing feedback time',s=>delete s.session.feedback.at],
  ['invalid feedback attempt',s=>s.session.feedback.attempt={}],['feedback during study',s=>s.session.queue[0].phase='study'],
  ['feedback without current item',s=>{s.session.queue=[];s.session.finished=['root-act'];}]
])invalid(knowledge,damage,label);

// Worker validation receives compact IDs, not full questions or word families.
const ids=box=>Object.fromEntries(Object.keys(box).map(id=>[id,{}]));
const compact={words:ids(lib.words),studyItems:ids(lib.studyItems),cards:ids(lib.cards),families:lib.families.map(f=>({id:f.id,studyIds:f.studyIds||f.wordIds}))};
for(const s of [knowledge,knowledgeString,wrongKnowledge,resumed,word,review,skipped,allKnown])assert.deepEqual(E.validateState(s,compact),valid(s));
const corrupt=clone(question);corrupt.session.queue[0].optionOrder='broken';assert.throws(()=>E.validateState(corrupt,compact),/练习进度不正确/);

console.log('Backup boundary passed: valid spelling/knowledge study, feedback and completion; old missing/null option order; known-skip refill and zero total; damaged order, metadata, queue and feedback rejection; compact Worker compatibility.');
