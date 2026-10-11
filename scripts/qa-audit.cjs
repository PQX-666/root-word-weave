const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.QA_AUDIT_ORIGIN||'http://127.0.0.1:4114',output=path.resolve(__dirname,'../test-output/audit');
// Only run against the isolated audit service after its validation modules have
// been restarted. Never point this state-seeding script at a real account.
(async()=>{
 const E=await import('../dist/engine.js'),M=await import('../dist/meaning-engine.js');
 const lib=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../dist/library.json'),'utf8'));fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const snapshot=async()=>{const r=await page.request.get(origin+'/api/progress');assert.equal(r.status(),200);return r.json();};
 const saved=async predicate=>{for(let i=0;i<120;i++){const r=await snapshot();if(predicate(r.state,r))return r;await page.waitForTimeout(50);}throw Error('Expected saved state did not arrive');};
 const loaded=async()=>{await page.locator('#main').waitFor();await page.waitForFunction(()=>document.querySelector('#main')?.children.length&&!document.querySelector('#main .loading'));};
 const seed=async(s,route='today')=>{E.validateState(s,lib);const before=await snapshot(),r=await page.request.put(origin+'/api/progress',{data:{revision:before.revision,state:s}});assert.equal(r.status(),200,await r.text());await page.goto(origin+'/#'+route);await page.reload();await loaded();};
 const hidden=async id=>{await page.locator('.meaning-page[data-meaning-phase="hidden"]'+(id?'[data-meaning-word="'+id+'"]':'')).waitFor();assert.equal(await page.locator('.meaning-answer').count(),0);return page.locator('.meaning-page').getAttribute('data-meaning-word');};
 const reveal=async()=>{await page.locator('[data-action="meaning-reveal"]:not([disabled])').click();await page.locator('.meaning-answer').waitFor();await page.locator('[data-action="meaning-grade"]:not([disabled])').first().waitFor();};
 const grade=async g=>{const token=await page.locator('[data-action="meaning-grade"]').first().getAttribute('data-token');await page.locator('[data-action="meaning-grade"][data-grade="'+g+'"]').click();await saved(s=>s.meaningEvents.some(e=>e.id===token));};
 const shot=async n=>page.screenshot({path:path.join(output,n+'.png'),fullPage:true});
 const selectGoal=async goal=>{await page.goto(origin+'/#me');await page.locator('#study-goal').waitFor();await page.locator('#study-goal').selectOption(goal);await saved(s=>s.settings.goal===goal);};
 const importFile=async state=>page.locator('#backup-file').setInputFiles({name:'audit-progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'词根织网',state}))});
 const now=Date.now(),day=E.dayKey(),sense=lib.words.contract.studyItemIds.find(x=>x.includes('::'));
 assert.ok(sense&&E.studyItem(lib,sense).isAdditionalSense);
 const record=(due=now-1000)=>({due,intervalDays:2,first:now-5*86400000,last:now-2*86400000,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false});
 // Completed attendance is historical. Changing the target can reveal another
 // due sense that must remain reachable without erasing that attendance.
 const checked=E.freshState();checked.settings.target=0;checked.settings.goal='cet4';checked.meanings.act=record(now+86400000);checked.meanings[sense]=record();
 E.ensureDay(checked,lib);const checkedDay=M.ensureMeaningDay(checked,lib);checkedDay.reviewIds=['act'];checkedDay.completed=['act'];checkedDay.checked=true;
 await seed(checked);await page.getByRole('heading',{name:'今天已完成',exact:true}).waitFor();assert.equal(await page.locator('.learning-home > a.btn').count(),0);
 await selectGoal('ielts');let after=await saved(s=>s.meaningDays[day].reviewIds.includes(sense));assert.equal(after.state.meaningDays[day].checked,true);assert.deepEqual(after.state.meaningDays[day].completed,['act']);
 await page.goto(origin+'/#today');await page.locator('.today-family').waitFor();assert.equal(await page.locator('.learning-home > a.btn').count(),1,'Newly eligible due sense needs a home action');await shot('checked-goal-switch');
 await page.locator('.learning-home > a.btn').click();await hidden(sense);after=await snapshot();assert.equal(after.state.meaningSession.total,1);assert.equal(after.state.meaningSession.queue[0].new,false);
 await reveal();await grade('clear');await page.getByRole('heading',{name:'今天的学习完成了',exact:true}).waitFor();after=await snapshot();assert.equal(after.state.meaningDays[day].checked,true);assert.ok(after.state.meaningDays[day].completed.includes(sense));
 // Foundation skip affects the base sense, while the additional sense stays
 // eligible. Cancelling it restores pending reviews without resetting evidence.
 const foundation=E.freshState();foundation.settings.target=0;foundation.settings.goal='ielts';foundation.settings.foundation='cet4';foundation.settings.skipFoundation=true;
 foundation.meanings.contract=record();foundation.meanings[sense]=record();foundation.words.contract={status:'review',due:now-1000,stage:2,repetitions:3,first:now-4*86400000,last:now-2*86400000,lapses:1,aided:false};
 E.ensureDay(foundation,lib);M.ensureMeaningDay(foundation,lib);const evidence=structuredClone({meanings:foundation.meanings,words:foundation.words});
 await seed(foundation,'me');assert.ok(!(await snapshot()).state.meaningDays[day].reviewIds.includes('contract'));assert.ok((await snapshot()).state.meaningDays[day].reviewIds.includes(sense));
 await page.locator('#skip-foundation').uncheck();after=await saved(s=>!s.settings.skipFoundation&&s.meaningDays[day].reviewIds.includes('contract'));assert.deepEqual(after.state.meanings,evidence.meanings);assert.deepEqual(after.state.words,evidence.words);
 await page.locator('#skip-foundation').check();after=await saved(s=>s.settings.skipFoundation&&!s.meaningDays[day].reviewIds.includes('contract'));assert.ok(after.state.meaningDays[day].reviewIds.includes(sense));
 await page.locator('#foundation').selectOption('none');after=await saved(s=>s.settings.foundation==='none'&&!s.settings.skipFoundation&&s.meaningDays[day].reviewIds.includes('contract'));assert.deepEqual(after.state.meanings,evidence.meanings);
 await page.goto(origin+'/#today');await page.locator('.today-family').waitFor();await shot('foundation-restored');
 // Individual known/undo also preserves the old meaning/spelling evidence.
 await page.goto(origin+'/#word/contract');await page.locator('.word-page').waitFor();await page.locator('[data-action="word-known"]').click();after=await saved(s=>s.words.contract.status==='known'&&!s.meaningDays[day].reviewIds.includes('contract'));assert.deepEqual(after.state.meanings,evidence.meanings);
 await page.getByRole('button',{name:'重新学习这个义项',exact:true}).waitFor();await page.locator('[data-action="word-known"]').click();after=await saved(s=>s.words.contract.status==='review'&&s.meaningDays[day].reviewIds.includes('contract'));for(const key of ['due','stage','repetitions','first','lapses','aided'])assert.equal(after.state.words.contract[key],evidence.words.contract[key],'Known undo preserves '+key);
 await page.goto(origin+'/#today');await page.locator('.learning-home > a.btn').click();await hidden();const token=(await snapshot()).state.meaningSession.queue[0].token;
 await page.goto(origin+'/#me');await page.locator('#study-goal').waitFor();for(const id of ['study-goal','foundation','skip-foundation'])assert.equal(await page.locator('#'+id).isDisabled(),true);await page.goto(origin+'/#read');await hidden();assert.equal((await snapshot()).state.meaningSession.queue[0].token,token);
 // A normal interrupted spelling backup imports and resumes; meaningful
 // malformed versions must be rejected both in the UI and by the API.
 const normal=E.freshState();normal.settings.target=3;normal.bookmarks=['act'];E.ensureDay(normal,lib);E.startSession(normal,lib,'learn');const normalSession=structuredClone(normal.session);
 await seed(E.freshState(),'me');page.once('dialog',d=>d.accept());await importFile(normal);after=await saved(s=>s.session?.id===normalSession.id);assert.deepEqual(after.state.session,normalSession);
 await page.goto(origin+'/#practice');await page.locator('.quiz-word,#answer').first().waitFor();assert.equal(await page.locator('.sidebar').isVisible(),false);await page.reload();await page.locator('.quiz-word,#answer').first().waitFor();assert.deepEqual((await snapshot()).state.session,normalSession);
 const knowledge=E.freshState();E.ensureDay(knowledge,lib);E.startSession(knowledge,lib,'knowledge',now,['root-act']);assert.ok(knowledge.session);
 await page.goto(origin+'/#me');await page.locator('#backup-file').waitFor({state:'attached'});const beforeBad=await snapshot(),badCases=[
  ['broken knowledge options',x=>{x.session=structuredClone(knowledge.session);x.session.queue[0].optionOrder='broken';}],
  ['missing total',x=>delete x.session.total],
  ['missing mode',x=>delete x.session.mode],
  ['missing streak',x=>delete x.session.queue[0].streak],
  ['invalid feedback',x=>{x.session.feedback={correct:true,done:true,id:'constructor',event:'bad',at:now,attempt:'x'};}]
 ];
 for(const [label,breakState]of badCases){const bad=structuredClone(normal);breakState(bad);let confirmShown=false;const dialog=d=>{confirmShown=true;d.dismiss();};page.on('dialog',dialog);await page.evaluate(()=>{document.querySelector('#toast').style.display='none';});await importFile(bad);await page.locator('#toast').waitFor({state:'visible'});assert.ok(/练习|备份|记录/.test(await page.locator('#toast').innerText()),label+' displays a validation message');assert.equal(confirmShown,false,label+' rejected before replace confirmation');page.removeListener('dialog',dialog);const untouched=await snapshot();assert.equal(untouched.revision,beforeBad.revision,label+' does not save');assert.deepEqual(untouched.state,beforeBad.state,label+' does not replace current state');
  const r=await page.request.put(origin+'/api/progress',{data:{revision:untouched.revision,state:bad}});assert.equal(r.status(),400,label+' rejected by API');assert.equal((await snapshot()).revision,beforeBad.revision);
 }
 await shot('invalid-backup-rejected');
 // Old backups absent the newer meaning fields/voice preference remain valid.
 const old=structuredClone(normal);old.session=null;for(const key of ['meanings','meaningDays','meaningEvents','meaningSession'])delete old[key];delete old.settings.encouragement;old.bookmarks=['active'];
 page.once('dialog',d=>d.accept());await importFile(old);after=await saved(s=>s.session===null&&s.bookmarks.includes('active'));assert.equal(after.state.settings.encouragement,'warm');assert.deepEqual(after.state.words,old.words);assert.equal(Object.keys(after.state.meanings).length,0);
 assert.deepEqual(errors,[],'No browser runtime errors');await browser.close();console.log('Audit boundary browser QA passed: checked-day target expansion has home entry, preserved attendance, foundation skip/cancel and extra-sense review, known/undo evidence continuity, active settings lock, normal interrupted backup/reload, broken knowledge options plus four damaged-session backup and API rejections, old-backup defaults.');
})().catch(e=>{console.error(e);process.exit(1);});
