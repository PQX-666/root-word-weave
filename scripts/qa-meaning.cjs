const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.QA_MEANING_ORIGIN||'http://127.0.0.1:4112',output=path.resolve(__dirname,'../test-output/meaning-final');
(async()=>{
 const E=await import('../dist/engine.js'),M=await import('../dist/meaning-engine.js'),R=await import('../dist/reader.js');
 const lib=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../dist/library.json'),'utf8'));
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(15000);
 const snapshot=async()=>{const r=await page.request.get(origin+'/api/progress');assert.equal(r.status(),200);return r.json();};
 const saved=async test=>{for(let i=0;i<100;i++){const r=await snapshot();if(test(r.state))return r;await page.waitForTimeout(50);}throw Error('Saved state did not reach expected condition');};
 const seed=async(state,route='today')=>{
  E.validateState(state,lib);
  const current=await snapshot(),r=await page.request.put(origin+'/api/progress',{data:{revision:current.revision,state}});
  assert.equal(r.status(),200,await r.text());
  await page.goto(origin+'/#'+route);await page.reload();
  await page.locator('#main').waitFor();
  await page.waitForFunction(()=>document.querySelector('#main')?.children.length&&!document.querySelector('#main .loading'));
 };
 const hidden=async(id)=>{
  await page.locator('.meaning-page[data-meaning-phase="hidden"]'+(id?'[data-meaning-word="'+id+'"]':'')).waitFor();
  assert.equal(await page.locator('.meaning-answer').count(),0);
  assert.equal(await page.locator('.reader-definition').count(),0);
  assert.equal(await page.locator('.reader-association').count(),0);
  const item=await page.locator('.meaning-page').getAttribute('data-meaning-word'),w=E.studyItem(lib,item);
  const text=await page.locator('.meaning-page').innerText();
  assert.ok(!text.includes(w.meaning),'Hidden page must not contain the answer meaning');
  assert.ok(!text.includes(w.mnemonic),'Hidden page must not contain the mnemonic');
  assert.ok(!text.includes(w.examples[0].translation),'Hidden page must not contain the example translation');
  return item;
 };
 const reveal=async()=>{await page.locator('[data-action="meaning-reveal"]').click();await page.locator('.meaning-answer').waitFor();await page.locator('[data-action="meaning-grade"]:not([disabled])').first().waitFor();};
 const grade=async(value)=>{
  const token=await page.locator('[data-action="meaning-grade"]').first().getAttribute('data-token');
  await page.locator('[data-action="meaning-grade"][data-grade="'+value+'"]').click();
  await saved(s=>s.meaningEvents.some(e=>e.id===token));
  await page.locator('.meaning-controls button:not([disabled]),[data-action="meaning-finish"]:not([disabled])').first().waitFor();
  return token;
 };
 const now=Date.now(),s=E.freshState();s.settings.target=3;
 s.words.act={status:'review',due:now+86400000,stage:2};
 s.reading.act={cursor:'action',seenIds:['act'],profile:'all|none|false',completed:false,updated:now-1000};
 E.ensureDay(s,lib);M.ensureMeaningDay(s,lib);M.chooseMeaningFamily(s,lib,'act');
 const preserved={words:structuredClone(s.words),reading:structuredClone(s.reading)};
 await seed(s);await page.locator('.today-family').waitFor();
 await page.screenshot({path:path.join(output,'today-desktop.png'),fullPage:true});
 await page.getByRole('link',{name:'开始学习',exact:true}).click();await hidden('act');
 await page.screenshot({path:path.join(output,'front-desktop.png'),fullPage:true});
 const initial=await saved(s=>s.meaningSession?.queue[0]?.id==='act');
 assert.equal(initial.state.meaningSession.total,3);
 await reveal();await page.reload();await page.locator('.meaning-answer').waitFor();
 assert.equal(await page.locator('.meaning-page').getAttribute('data-meaning-word'),'act');
 assert.equal((await snapshot()).state.meaningSession.queue[0].phase,'revealed');
 await page.screenshot({path:path.join(output,'back-desktop.png'),fullPage:true});
 await grade('forgot');await hidden('action');
 let after=await snapshot();assert.equal(after.state.meaningSession.finished.length,1);
 assert.equal(after.state.meaningEvents.length,1);assert.equal(after.state.meanings.act.lastGrade,'forgot');
 assert.equal(E.dayKey(after.state.meanings.act.due),E.dayKey(Date.now()+86400000));
 // Every rating advances. A failed initial card returns only after the other cards.
 let guard=0;while(await page.locator('.meaning-page[data-meaning-phase]').count()){
  assert.ok(++guard<10,'Reinforcement must terminate');await hidden();await reveal();await grade('clear');
 }
 await page.getByRole('heading',{name:'今天的学习完成了',exact:true}).waitFor();
 after=await saved(s=>s.meaningSession?.queue.length===0&&s.meaningDays[E.dayKey()].checked===true);
 assert.equal(after.state.meaningSession.finished.length,3);
 assert.equal(new Set(after.state.meaningSession.finished).size,3);
 assert.equal(after.state.meaningEvents.length,4);
 assert.equal(after.state.meanings.act.intervalDays,1,'Same-round reinforcement must not stretch tomorrow review');
 assert.deepEqual(after.state.words,preserved.words);assert.deepEqual(after.state.reading,preserved.reading);
 await page.screenshot({path:path.join(output,'finish-desktop.png'),fullPage:true});
 await page.locator('[data-action="meaning-finish"]').click();await page.locator('.today-family').waitFor();
 after=await saved(s=>!s.meaningSession&&s.meaningDays[E.dayKey()].checked);
 assert.equal(after.state.meaningDays[E.dayKey()].completed.length,3);
 assert.deepEqual(after.state.words,preserved.words);assert.deepEqual(after.state.reading,preserved.reading);
 const completedDay=structuredClone(after.state);
 await page.goto(origin+'/#review');await page.getByRole('heading',{name:'接下来的复习安排',exact:true}).waitFor();
 assert.ok((await page.locator('#main').innerText()).includes('act'));
 assert.equal(await page.locator('[data-action="meaning-review"]').count(),0);
 await page.screenshot({path:path.join(output,'review-desktop.png'),fullPage:true});
 // Free browsing has its own cursor and never grades a meaning item.
 const meaningBefore=structuredClone(after.state.meanings),eventsBefore=after.state.meaningEvents.length;
 await page.goto(origin+'/#browse/act');await page.locator('[data-reader-word="action"]').waitFor();
 await page.locator('[data-action="reader-next"]').click();await page.locator('[data-reader-word="active"]').waitFor();
 after=await saved(s=>s.reading.act.cursor==='active');
 assert.deepEqual(after.state.meanings,meaningBefore);assert.equal(after.state.meaningEvents.length,eventsBefore);
 await page.reload();await page.locator('[data-reader-word="active"]').waitFor();
 // Due-only target zero starts with the due item and assigns a larger interval only after delayed successful recall.
 const due=E.freshState();due.settings.target=0;
 due.meanings.action={due:now-1000,intervalDays:2,first:now-4*86400000,last:now-2*86400000,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false};
 E.ensureDay(due,lib);M.ensureMeaningDay(due,lib);
 await seed(due);await page.locator('.today-family').waitFor();
 await page.getByRole('link',{name:'开始学习',exact:true}).click();await hidden('action');
 after=await snapshot();assert.equal(after.state.meaningSession.queue.length,1);assert.equal(after.state.meaningSession.queue[0].new,false);
 assert.equal(after.state.meaningDays[E.dayKey()].newIds.length,0);
 await reveal();await grade('clear');after=await snapshot();assert.ok(after.state.meanings.action.intervalDays>=4);
 // New and due cards together always place the due card first.
 due.settings.target=3;due.meaningDays={};due.meaningSession=null;E.ensureDay(due,lib);M.ensureMeaningDay(due,lib);M.chooseMeaningFamily(due,lib,'spect');
 await seed(due,'read');await hidden('action');
 after=await saved(s=>s.meaningSession?.total===4);assert.equal(after.state.meaningSession.queue[1].family,'spect');
 // Opening a clue page during hidden recall records aided recall; self-rated clear becomes fuzzy.
 const cue=E.freshState();cue.settings.target=3;E.ensureDay(cue,lib);M.ensureMeaningDay(cue,lib);M.chooseMeaningFamily(cue,lib,'act');
 await seed(cue,'read');await hidden('act');
 await page.goto(origin+'/#family/act');await page.locator('.atlas-scroll').waitFor();
 await saved(s=>s.meaningSession?.queue[0]?.aided===true);
 await page.goto(origin+'/#read');await hidden('act');await reveal();
 assert.ok((await page.locator('.meaning-rate-guide').innerText()).includes('已查看提示'));
 await grade('clear');after=await snapshot();assert.equal(after.state.meanings.act.lastGrade,'fuzzy');assert.equal(after.state.meanings.act.lastAided,true);
 // A settings page without a relevant answer is not a clue.
 await seed(cue,'read');await hidden('act');await page.goto(origin+'/#me');await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();
 assert.equal((await snapshot()).state.meaningSession.queue[0].aided,false,'Empty profile page does not provide an answer clue');
 const cue2=E.freshState();cue2.settings.target=3;cue2.bookmarks=['act'];E.ensureDay(cue2,lib);M.ensureMeaningDay(cue2,lib);M.chooseMeaningFamily(cue2,lib,'act');
 await seed(cue2,'read');await hidden('act');await page.goto(origin+'/#me');await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();
 await saved(s=>s.meaningSession?.queue[0]?.aided===true);
 await page.goto(origin+'/#read');await hidden('act');
 // A conflicting device revision must not overwrite newer data or repeat a rating.
 await reveal();const priorConflict=await snapshot(),external=structuredClone(priorConflict.state);external.bookmarks=['active'];
 assert.equal((await page.request.put(origin+'/api/progress',{data:{revision:priorConflict.revision,state:external}})).status(),200);
 await page.locator('[data-action="meaning-grade"][data-grade="clear"]').click();await hidden('action');
 await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('另一台设备已更新记录'));
 assert.ok((await page.getByRole('alert').innerText()).includes('导出当前备份'));
 await page.locator('[data-action="retry"]').click();await page.getByRole('alert').waitFor();
 const unchanged=await snapshot();assert.equal(unchanged.revision,priorConflict.revision+1);
 assert.equal(unchanged.state.meaningEvents.length,priorConflict.state.meaningEvents.length);
 assert.deepEqual(unchanged.state.bookmarks,['active']);
 // A backup contains the unsaved grade exactly once; refreshing returns the external version.
 await page.goto(origin+'/#me');await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();
 const downloadReady=page.waitForEvent('download');await page.locator('[data-action="backup"]').click();
 const download=await downloadReady,tempPath=await download.path(),backup=JSON.parse(fs.readFileSync(tempPath,'utf8'));
 assert.equal(backup.state.meaningEvents.length,priorConflict.state.meaningEvents.length+1);
 assert.equal(backup.state.meaningSession.queue[0].id,'action');
 await page.reload();await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();
 assert.deepEqual((await snapshot()).state.bookmarks,['active']);
 // Additional senses need context, but only the English sentence is visible before revealing.
 const extra=Object.values(lib.studyItems).find(w=>w.isAdditionalSense),sense=E.freshState();sense.settings.target=0;
 sense.meanings[extra.id]={due:now-1000,intervalDays:2,first:now-4*86400000,last:now-2*86400000,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false};
 E.ensureDay(sense,lib);M.ensureMeaningDay(sense,lib);
 await seed(sense,'read');await hidden(extra.id);
 assert.equal((await page.locator('.meaning-context').innerText()).trim(),extra.examples[0].text);
 await page.screenshot({path:path.join(output,'additional-sense-desktop.png'),fullPage:true});
 // Viewport and enlarged-text checks use a fresh simple card to keep layout reproducible.
 await seed(cue,'read');await hidden('act');
 const layout=async()=>page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('.meaning-controls button')].map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,touchable:!!hit?.closest('button')&&hit.closest('button')===b};});
  const sidebar=document.querySelector('.sidebar'),nav=sidebar.getBoundingClientRect();
  return {width:document.documentElement.scrollWidth,viewport:innerWidth,height:innerHeight,controlEdge:sidebar.hidden?innerHeight:nav.top,navRight:nav.right,buttons};
 });
 for(const width of [320,390,730,1001,1440]){
  await page.setViewportSize({width,height:width<=390?844:1000});await page.waitForTimeout(150);
  let box=await layout();assert.ok(box.width<=box.viewport,'No horizontal overflow at '+width);
  if(width<=700)for(const b of box.buttons){assert.ok(b.top>=0&&b.bottom<=box.controlEdge,'Reveal must fit the focused viewport at '+width);assert.ok(b.touchable,'Reveal must receive pointer at '+width);}
  await reveal();box=await layout();assert.ok(box.width<=box.viewport,'No horizontal overflow on revealed card at '+width);
  if(width<=700)for(const b of box.buttons){assert.ok(b.top>=0&&b.bottom<=box.controlEdge,'All ratings must fit the focused viewport at '+width);assert.ok(b.touchable,'All ratings must receive pointer at '+width);}
  if(width===390){await page.screenshot({path:path.join(output,'back-mobile.png'),fullPage:true});}
  // Restore hidden phase without modifying grades or the daily plan.
  const current=await snapshot(),h=current.state;h.meaningSession.queue[0].phase='hidden';await seed(h,'read');
  if(width===390)await page.screenshot({path:path.join(output,'front-mobile.png'),fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await reveal();
 const largeStyle=await page.addStyleTag({content:'html{font-size:200%!important}'});await page.waitForTimeout(200);
 const large=await layout();assert.ok(large.width<=large.viewport,'200% text must not introduce horizontal page overflow');
 for(const b of large.buttons){assert.ok(b.top>=0&&b.bottom<=large.controlEdge,'Enlarged ratings must remain inside the focused viewport');assert.ok(b.touchable,'Enlarged ratings must remain clickable');}
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,document.documentElement.scrollHeight);});
 const detail=await page.locator('.reader-more summary').boundingBox();assert.ok(detail&&detail.y>=0&&detail.y+detail.height<large.buttons[0].top,'The last answer section remains scrollable above the fixed ratings');
 await page.screenshot({path:path.join(output,'back-mobile-200.png'),fullPage:true});
 await page.screenshot({path:path.join(output,'back-mobile-200-viewport.png'),fullPage:false});
 await largeStyle.evaluate(style=>style.remove());
 await seed(s);await page.locator('.today-family').waitFor();await page.screenshot({path:path.join(output,'today-mobile.png'),fullPage:true});
 await seed(completedDay,'review');await page.getByRole('heading',{name:'接下来的复习安排',exact:true}).waitFor();await page.screenshot({path:path.join(output,'review-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[],'No browser runtime errors');await browser.close();
 console.log('Meaning browser QA passed: one-click daily entry; hidden/reveal/reload; three ratings and automatic advancement; bounded reinforcement; check-in and future review; old spelling/browse preservation; due-first and target-zero; clue downgrade; external-revision conflict and unsaved backup; context-only extra senses; 320/390/730/1001/1440 and mobile 200% controls.');
})().catch(error=>{console.error(error);process.exit(1);});
