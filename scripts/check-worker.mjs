import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import * as E from '../dist/engine.js';
import {moveReading} from '../dist/reader.js';
import * as M from '../dist/meaning-engine.js';
const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8')),db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../drizzle/0000_complex_ulik.sql',import.meta.url),'utf8'));
const env={DB:{prepare(sql){return {bind(...p){const stmt=db.prepare(sql);return {async first(){return stmt.get(...p)||null;},async run(){return {meta:{changes:Number(stmt.run(...p).changes)}};}};}};}}};
const request=(path,user='worker-qa',method='GET',body)=>new Request('https://root.example'+path,{method,headers:{'content-type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})});
const library=await worker.fetch(request('/library.json'),env);assert.equal(library.status,200);assert.deepEqual(await library.json(),lib);
for(const path of ['/growth.js','/reader.js','/meaning-engine.js','/meaning-view.js','/learning-flow.js','/knowledge-lookup.js','/catalog-search.js','/engine.js','/'])assert.equal((await worker.fetch(request(path),env)).status,200);
assert.equal((await worker.fetch(request('/api/progress',null),env)).status,401);
const s=E.freshState(),now=Date.now();E.ensureDay(s,lib,now);const last=lib.families.at(-1).wordIds[0],sense=Object.keys(lib.studyItems)[0],card=Object.keys(lib.cards).at(-1);for(const id of [last,sense])s.words[id]={status:'review',due:now+86400000,stage:0};s.knowledge[card]={due:now+86400000,stage:0};s.bookmarks=[last,sense];E.startSession(s,lib,'knowledge',now,[card]);
moveReading(s,lib,'act','next',now);
M.startMeaningSession(s,lib,'family',now,'act');const mq=s.meaningSession.queue[0];M.revealMeaning(s,s.meaningSession.id,mq.token);M.gradeMeaning(s,lib,'forgot',s.meaningSession.id,mq.token,now);
assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:0,state:s}),env)).status,200);assert.deepEqual((await(await worker.fetch(request('/api/progress'),env)).json()).state,E.validateState(s,lib));
const bad=E.freshState();bad.words.unlisted={status:'review',due:0,stage:0};assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:1,state:bad}),env)).status,400);bad.words={};bad.knowledge.constructor={due:0,stage:0};assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:1,state:bad}),env)).status,400);
console.log('Built Worker passed: all resources, full catalog response, compact ID validation, new families/senses/cards, API persistence, auth and invalid IDs.');
bad.knowledge={};bad.reading.act={cursor:'unlisted',seenIds:[],profile:'all|none|false',completed:false,updated:now};assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:1,state:bad}),env)).status,400);
const wrongFamily=JSON.parse(JSON.stringify(s));wrongFamily.meaningSession.queue[0].family='port';assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:1,state:wrongFamily}),env)).status,400);wrongFamily.meaningSession=null;wrongFamily.meanings.act.intervalDays=0;assert.equal((await worker.fetch(request('/api/progress','worker-qa','PUT',{revision:1,state:wrongFamily}),env)).status,400);
console.log('Meaning Worker API passed: real grades/queue persisted, invalid family membership and intervals rejected.');

const lightState=E.freshState();M.startMeaningSession(lightState,lib,'light',now);assert.equal(lightState.meaningSession.total,5);
assert.equal((await worker.fetch(request('/api/progress','light-worker-qa','PUT',{revision:0,state:lightState}),env)).status,200);
const storedLight=(await(await worker.fetch(request('/api/progress','light-worker-qa'),env)).json()).state;
assert.equal(storedLight.meaningSession.mode,'light');assert.equal(storedLight.settings.encouragement,'warm');
const wrongStyle=structuredClone(lightState);wrongStyle.settings.encouragement='invalid';
assert.equal((await worker.fetch(request('/api/progress','light-worker-qa','PUT',{revision:1,state:wrongStyle}),env)).status,400);
console.log('Humane Worker API passed: light sessions and warm preferences persist; invalid preferences rejected.');

const practice=E.freshState();E.startSession(practice,lib,'knowledge',now,['root-act']);E.studyDone(practice);
for(const damage of [x=>x.session.queue[0].optionOrder='broken',x=>delete x.session.total,x=>x.session.feedback={correct:true}]){
  const corrupt=structuredClone(practice);damage(corrupt);
  assert.equal((await worker.fetch(request('/api/progress','backup-worker-qa','PUT',{revision:0,state:corrupt}),env)).status,400);
  assert.equal((await(await worker.fetch(request('/api/progress','backup-worker-qa'),env)).json()).revision,0,'Rejected backups must not replace records');
}
practice.session.queue[0].optionOrder=null;
assert.equal((await worker.fetch(request('/api/progress','backup-worker-qa','PUT',{revision:0,state:practice}),env)).status,200);
const storedPractice=(await(await worker.fetch(request('/api/progress','backup-worker-qa'),env)).json()).state;
assert.deepEqual(storedPractice.session.queue[0].optionOrder,[0,1,2,3]);
console.log('Backup Worker API passed: damaged practice/order/feedback rejected without writes; old null order normalized and persisted.');
