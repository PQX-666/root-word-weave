const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.QA_FOCUSED_ORIGIN||'http://127.0.0.1:4112';
const output=process.env.QA_FOCUSED_OUTPUT||path.resolve(__dirname,'../test-output/focused');

// All mutations are limited to the explicitly isolated QA service/account.
// This is functional/browser QA, not a substitute for the five-person study.
(async()=>{
 const E=await import('../dist/engine.js'),M=await import('../dist/meaning-engine.js');
 const lib=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../dist/library.json'),'utf8'));
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 const snapshot=async()=>{const r=await page.request.get(origin+'/api/progress');assert.equal(r.status(),200);return r.json();};
 const saved=async test=>{for(let i=0;i<120;i++){const r=await snapshot();if(test(r.state,r))return r;await page.waitForTimeout(50);}throw Error('Saved state did not reach expected condition');};
 const ready=async()=>{await page.locator('#main').waitFor();await page.waitForFunction(()=>document.querySelector('#main')?.children.length&&!document.querySelector('#main .loading'));};
 const seed=async(state,route='today')=>{
  E.validateState(state,lib);const current=await snapshot();
  const r=await page.request.put(origin+'/api/progress',{data:{revision:current.revision,state}});assert.equal(r.status(),200,await r.text());
  await page.goto(origin+'/#'+route);await page.reload();await ready();
 };
 const nav=async active=>{
  assert.deepEqual(await page.locator('#nav a').allTextContents(),['学习','探索','我的']);
  assert.equal(await page.locator('#nav [aria-current="page"]').innerText(),active);
 };
 const focused=async()=>{assert.equal(await page.locator('.sidebar').isVisible(),false);await page.locator('.study-exit,[data-action="leave-practice"]').first().waitFor();};
 const hidden=async id=>{
  await page.locator('.meaning-page[data-meaning-phase="hidden"]'+(id?'[data-meaning-word="'+id+'"]':'')).waitFor();
  const item=await page.locator('.meaning-page').getAttribute('data-meaning-word'),w=E.studyItem(lib,item),text=await page.locator('.meaning-page').innerText();
  assert.equal(await page.locator('.meaning-answer,.meaning-page .reader-definition,.meaning-page .reader-association').count(),0);
  for(const answer of [w.meaning,w.mnemonic,w.examples[0].translation])assert.ok(!text.includes(answer),'Hidden card leaks an answer: '+item);
  assert.equal(await page.locator('.meaning-page .atlas-scroll').count(),0);await focused();return item;
 };
 const reveal=async()=>{await page.locator('[data-action="meaning-reveal"]:not([disabled])').click();await page.locator('.meaning-answer').waitFor();await page.locator('[data-action="meaning-grade"]:not([disabled])').first().waitFor();};
 const grade=async value=>{
  const token=await page.locator('[data-action="meaning-grade"]').first().getAttribute('data-token');
  await page.locator('[data-action="meaning-grade"][data-grade="'+value+'"]').click();await saved(s=>s.meaningEvents.some(e=>e.id===token));
  await page.locator('.meaning-controls button:not([disabled]),[data-action="meaning-finish"]:not([disabled])').first().waitFor();return token;
 };
 const ratingLabels=async()=>{
  const warm=await page.locator('.meaning-grade-state').count();
  assert.deepEqual(await page.locator('.meaning-grade strong').allTextContents(),warm?['慢慢来','想起一些','这次想对']:['没想起','没想全','已想对']);
  if(warm)assert.deepEqual(await page.locator('.meaning-grade-state').allTextContents(),['没想起','没想全','已想对']);
  assert.equal(await page.locator('.meaning-grade small').count(),0);
  const text=(await page.locator('.meaning-controls').innerText());assert.ok(!/明天|今天复习|月|\d+ 天/.test(text),'Rating labels must not invite date shopping');
 };
 const counts=async()=>page.locator('.result-counts strong').allTextContents();
 const shot=async name=>page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
 const now=Date.now(),day=E.dayKey(),s=E.freshState();s.settings.target=3;
 s.words.act={status:'review',due:now+86400000,stage:2};
 s.reading.act={cursor:'action',seenIds:['act'],profile:'all|none|false',completed:false,updated:now-1000};
 s.meanings.action={due:now-1000,intervalDays:2,first:now-4*86400000,last:now-2*86400000,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false};
 E.ensureDay(s,lib);M.ensureMeaningDay(s,lib);M.chooseMeaningFamily(s,lib,'spect');
 const preserved={words:structuredClone(s.words),reading:structuredClone(s.reading),days:structuredClone(s.days)};
 await seed(s);await page.locator('.today-family').waitFor();await nav('学习');
 assert.equal(await page.locator('.learning-home > a.btn').count(),1,'Home must have one main action');
 const plan=await page.locator('.learning-plan-copy').innerText();assert.ok(plan.includes('先复习 1')&&plan.includes('spect')&&plan.includes('3'),'Plan must describe due-before-new content');
 assert.equal(await page.locator('[data-action="start-learn"],[data-action="start-review"],[data-action="checkin"]').count(),0,'Home must not expose duplicate tasks/check-in');
 await shot('today-desktop');await page.getByRole('link',{name:'开始学习',exact:true}).click();await hidden('action');
 let after=await saved(x=>x.meaningSession?.total===4);assert.equal(after.state.meaningSession.queue[0].new,false);assert.equal(after.state.meaningSession.queue[1].family,'spect');
 await shot('front-desktop');await reveal();await ratingLabels();
 assert.equal(await page.locator('.reader-more').getAttribute('open'),null,'Rich explanation defaults collapsed');
 assert.equal(await page.locator('.meaning-page .reader-example').count(),1,'Default answer has one example');
 // Opening a rich card and returning does not lose the current revealed card.
 await page.locator('.reader-more summary').click();await page.getByRole('button',{name:'打开完整词卡',exact:true}).click();await page.locator('dialog[open]').waitFor();
 await page.getByRole('link',{name:'返回刷词',exact:true}).click();assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
 assert.equal(await page.locator('.meaning-page').getAttribute('data-meaning-word'),'action');await page.locator('.reader-more summary').click();
 // Pausing and refreshing preserves both the word and reveal phase.
 await page.locator('.study-exit').click();await page.locator('.today-family').waitFor();assert.equal(await page.locator('.sidebar').isVisible(),true);
 await page.getByRole('link',{name:'继续学习',exact:true}).click();await page.locator('.meaning-answer').waitFor();
 await page.reload();await page.locator('.meaning-answer').waitFor();assert.equal(await page.locator('.meaning-page').getAttribute('data-meaning-word'),'action');await focused();
 await shot('back-desktop');await grade('forgot');await hidden();
 after=await snapshot();assert.equal(after.state.meaningSession.finished.length,1);assert.equal(after.state.meaningDays[day].checked,false);
 assert.equal(after.state.meanings.action.lastGrade,'forgot');
 // Keyboard reveal/rating keeps focus on meaningful controls across re-render.
 await page.locator('[data-action="meaning-reveal"]').focus();await page.keyboard.press('Enter');await page.locator('.meaning-answer').waitFor();await ratingLabels();
 await page.waitForFunction(()=>document.activeElement?.dataset.action==='meaning-grade');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.grade),'forgot');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.grade),'fuzzy');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.grade),'clear');
 const keyToken=await page.locator('[data-action="meaning-grade"]').first().getAttribute('data-token');await page.keyboard.press('Enter');
 await saved(x=>x.meaningEvents.some(e=>e.id===keyToken));await hidden();await page.waitForFunction(()=>document.activeElement?.dataset.action==='meaning-reveal');
 // Finish all first presentations. A remaining reinforcement prevents premature completion.
 while((await snapshot()).state.meaningSession.finished.length<4){await hidden();await reveal();await grade('clear');}
 after=await snapshot();assert.ok(after.state.meaningSession.queue.length>0);assert.equal(after.state.meaningDays[day].checked,false);
 assert.ok(!(await page.locator('#main').innerText()).includes('今天的学习完成了'));
 let guard=0;while(await page.locator('.meaning-page[data-meaning-phase]').count()){assert.ok(++guard<10);await hidden();await reveal();await grade('clear');}
 await page.getByRole('heading',{name:'今天的学习完成了',exact:true}).waitFor();await focused();
 after=await saved(x=>x.meaningSession?.queue.length===0&&x.meaningDays[day].checked===true);
 assert.equal(after.state.meaningSession.finished.length,4);assert.equal(after.state.meaningEvents.length,5);
 assert.deepEqual(await counts(),['3','1','1'],'Result counts deduplicate repeated events');
 assert.deepEqual(after.state.words,preserved.words);assert.deepEqual(after.state.reading,preserved.reading);assert.deepEqual(after.state.days,preserved.days);
 const complete=structuredClone(after.state);await shot('finish-desktop');
 await page.getByRole('button',{name:'结束今天',exact:true}).click();await page.getByRole('heading',{name:'今天已完成',exact:true}).waitFor();
 assert.equal(await page.locator('.learning-home > a.btn').count(),0);assert.equal((await snapshot()).state.meaningSession,null);await shot('done-today-desktop');
 await page.getByRole('link',{name:'复习安排',exact:true}).click();await page.getByRole('heading',{name:'复习安排',exact:true}).waitFor();await nav('学习');
 const upcoming=await page.locator('.list-item').allTextContents();assert.ok(upcoming.length>0);
 for(const id of Object.keys(complete.meanings))assert.ok(!(await page.locator('#main').innerText()).includes(E.studyItem(lib,id).meaning),'Schedule must not pre-show meanings');
 assert.ok(upcoming.some(text=>/action/.test(text)&&/月/.test(text)));await shot('review-desktop');
 // Browsing remains an independent saved cursor, accessible through a family.
 await page.goto(origin+'/#family/act');await page.locator('.atlas-scroll').waitFor();await nav('探索');
 const browseLink=page.locator('a[href="#browse/act"]');assert.ok(await browseLink.count()>0);await browseLink.first().click();await page.locator('[data-reader-word="action"]').waitFor();
 await page.locator('[data-action="reader-next"]').click();await page.locator('[data-reader-word="active"]').waitFor();after=await saved(x=>x.reading.act.cursor==='active');
 assert.deepEqual(after.state.meanings,complete.meanings);assert.equal(after.state.meaningEvents.length,complete.meaningEvents.length);
 await page.reload();await page.locator('[data-reader-word="active"]').waitFor();await page.locator('.reader-more summary').click();
 await page.getByRole('button',{name:'打开完整词卡',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.getByRole('link',{name:'返回浏览',exact:true}).click();
 assert.equal(await page.locator('[data-reader-word]').getAttribute('data-reader-word'),'active');
 await page.goto(origin+'/#knowledge');await page.getByRole('heading',{name:'构词知识库',exact:true}).waitFor();await nav('探索');
 await page.locator('[data-card]').first().click();await page.locator('dialog[open]').waitFor();await page.locator('[data-action="close-detail"]').click();
 assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal(new URL(page.url()).hash,'#knowledge');
 // Existing links still resolve, including task links with a family suffix.
 for(const [route,selector] of [['families','.family-grid'],['family/act','.atlas-scroll'],['word/action','.word-page'],['knowledge','.knowledge-card'],['review','.review-banner'],['me','#target'],['browse/act','[data-reader-word]']]){
  await page.goto(origin+'/#'+route);await page.locator(selector).first().waitFor();assert.equal(await page.locator('.sidebar').isVisible(),true);
 }
 const cue=E.freshState();cue.settings.target=3;E.ensureDay(cue,lib);M.ensureMeaningDay(cue,lib);M.chooseMeaningFamily(cue,lib,'act');
 await seed(cue,'read/act');await hidden('act');await page.locator('.study-exit').click();await page.locator('.today-family').waitFor();
 await page.getByRole('link',{name:'继续学习',exact:true}).click();await hidden('act');
 // A clue from direct atlas navigation is recorded and clear is downgraded.
 await page.goto(origin+'/#family/act');await page.locator('.atlas-scroll').waitFor();await saved(x=>x.meaningSession?.queue[0]?.aided===true);
 await page.goto(origin+'/#read');await hidden('act');await reveal();await grade('clear');after=await snapshot();assert.equal(after.state.meanings.act.lastGrade,'fuzzy');
 // Old backups without the meaning fields are accepted, without false mastery migration.
 const old=E.freshState();old.settings.target=2;old.words.act={status:'review',due:now+86400000,stage:1};old.bookmarks=['act'];old.reading=structuredClone(preserved.reading);E.ensureDay(old,lib);
 for(const key of ['meanings','meaningDays','meaningEvents','meaningSession'])delete old[key];
 await page.goto(origin+'/#me');await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();page.once('dialog',d=>d.accept());
 await page.locator('#backup-file').setInputFiles({name:'old-progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'词根织网',state:old}))});
 after=await saved(x=>x.settings.target===2&&x.words.act?.stage===1&&x.bookmarks.includes('act')&&Object.keys(x.meanings||{}).length===0);
 assert.deepEqual(after.state.reading,preserved.reading);await page.goto(origin+'/#today');await page.locator('.today-family').waitFor();
 // An unfinished old spelling session is reachable as optional work and is preserved.
 const legacy=E.freshState();legacy.settings.target=2;E.ensureDay(legacy,lib);E.startSession(legacy,lib,'learn');
 const legacyBefore=structuredClone(legacy.session);await seed(legacy);await page.getByRole('link',{name:/专项练习/}).click();
 await page.getByRole('heading',{name:'专项练习',exact:true}).waitFor();await page.getByRole('link',{name:'继续拼写练习',exact:true}).click();
 await page.locator('.quiz-word,#answer').first().waitFor();await focused();assert.deepEqual((await snapshot()).state.session,legacyBefore);
 await page.locator('[data-action="leave-practice"]').click();await page.locator('.today-family').waitFor();await page.goto(origin+'/#practice');await page.locator('.quiz-word,#answer').first().waitFor();await focused();
 // The empty task view does not manufacture attendance or show a completion claim.
 const empty=E.freshState();empty.settings.target=0;E.ensureDay(empty,lib);M.ensureMeaningDay(empty,lib);await seed(empty);
 assert.ok(!(await page.locator('.today-family').innerText()).includes('今天已完成'));assert.equal((await snapshot()).state.meaningDays[day].checked,false);
 // A transient save failure keeps the rating in memory and retry sends it exactly once.
 await seed(cue,'read');await hidden('act');await reveal();const failBefore=await snapshot();let blocked=false;
 await page.route('**/api/progress',async route=>{if(route.request().method()==='PUT'&&!blocked){blocked=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA unavailable'})});}else await route.continue();});
 await page.locator('[data-action="meaning-grade"][data-grade="clear"]').click();await hidden('action');await page.getByRole('alert').waitFor();
 assert.equal((await snapshot()).state.meaningEvents.length,failBefore.state.meaningEvents.length);await page.unroute('**/api/progress');
 await page.locator('[data-action="retry"]').click();after=await saved(x=>x.meaningEvents.length===failBefore.state.meaningEvents.length+1);assert.equal(after.state.meaningSession.queue[0].id,'action');
 // A later device revision is never overwritten; an exported backup retains the local unsaved grade.
 await reveal();const conflictBefore=await snapshot(),external=structuredClone(conflictBefore.state);external.bookmarks=['active'];
 assert.equal((await page.request.put(origin+'/api/progress',{data:{revision:conflictBefore.revision,state:external}})).status(),200);
 await page.locator('[data-action="meaning-grade"][data-grade="clear"]').click();await hidden();await page.getByRole('alert').waitFor();
 assert.ok((await page.getByRole('alert').innerText()).includes('记录版本已变化'));assert.ok((await page.getByRole('alert').innerText()).includes('请先导出当前备份'));await page.locator('[data-action="retry"]').click();
 after=await snapshot();assert.equal(after.revision,conflictBefore.revision+1);assert.equal(after.state.meaningEvents.length,conflictBefore.state.meaningEvents.length);assert.deepEqual(after.state.bookmarks,['active']);
 await page.goto(origin+'/#me');await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();
 const waitingDownload=page.waitForEvent('download');await page.locator('[data-action="backup"]').click();const download=await waitingDownload;
 const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.state.meaningEvents.length,conflictBefore.state.meaningEvents.length+1);
 await page.reload();await page.getByRole('heading',{name:'我的积累',exact:true}).waitFor();assert.deepEqual((await snapshot()).state.bookmarks,['active']);
 // Extra senses show English context only before the reveal.
 const extra=Object.values(lib.studyItems).find(w=>w.isAdditionalSense),sense=E.freshState();sense.settings.target=0;
 sense.meanings[extra.id]={due:now-1000,intervalDays:2,first:now-4*86400000,last:now-2*86400000,repetitions:2,lapses:0,lastGrade:'clear',lastAided:false};E.ensureDay(sense,lib);M.ensureMeaningDay(sense,lib);
 await seed(sense,'read');await hidden(extra.id);assert.equal((await page.locator('.meaning-context').innerText()).trim(),extra.examples[0].text);await shot('additional-sense');
 // Responsive checks inspect pointer hits as well as nominal bounding boxes.
 const layout=async()=>page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,height:innerHeight,buttons:[...document.querySelectorAll('.meaning-controls button')].map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,touchable:hit?.closest('button')===b};})}));
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:width<=390?844:1000});await seed(cue,'read');await hidden('act');await page.waitForTimeout(160);
  let box=await layout();assert.ok(box.width<=box.viewport,'Hidden overflow at '+width);
  if(width<=390)for(const b of box.buttons){assert.ok(b.top>=0&&b.bottom<=box.height);assert.ok(b.touchable);}
  await reveal();await ratingLabels();box=await layout();assert.ok(box.width<=box.viewport,'Revealed overflow at '+width);
  if(width<=390)for(const b of box.buttons){assert.ok(b.top>=0&&b.bottom<=box.height);assert.ok(b.touchable);}
  await shot('back-'+width);if(width===390)await page.locator('.meaning-controls').screenshot({path:path.join(output,'warm-buttons.png')});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,document.documentElement.scrollHeight);});
  if(width<=390){const summary=await page.locator('.reader-more summary').boundingBox(),footer=await page.locator('.meaning-controls').boundingBox();assert.ok(summary.y>=0&&summary.y+summary.height<=footer.y,'Last answer content can scroll above fixed controls at '+width);}
 }
 await page.setViewportSize({width:390,height:844});await seed(cue,'read');await hidden('act');await shot('front-mobile');await reveal();
 const style=await page.addStyleTag({content:'html{font-size:200%!important}'});await page.waitForTimeout(180);let box=await layout();assert.ok(box.width<=box.viewport,'200% text overflow');
 for(const b of box.buttons){assert.ok(b.top>=0&&b.bottom<=box.height,'200% core controls stay on screen');assert.ok(b.touchable,'200% core controls receive pointer');}
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,document.documentElement.scrollHeight);});
 const end=await page.locator('.reader-more summary').boundingBox(),footer=await page.locator('.meaning-controls').boundingBox();assert.ok(end.y>=0&&end.y+end.height<=footer.y,'200% answer remains scrollable above footer');
 await shot('back-mobile-200');await page.screenshot({path:path.join(output,'back-mobile-200-viewport.png'),fullPage:false});await style.evaluate(x=>x.remove());
 await seed(s);await shot('today-mobile');await seed(complete,'read');await page.getByRole('heading',{name:'今天的学习完成了',exact:true}).waitFor();await shot('finish-mobile');
 await seed(complete,'review');await page.getByRole('heading',{name:'复习安排',exact:true}).waitFor();await shot('review-mobile');
 assert.deepEqual(errors,[],'No browser runtime errors');await browser.close();
 console.log('Focused browser QA passed: three-entry navigation, one daily action, due-before-new, focused study, answer layering, three ratings and keyboard focus, pause/reload, reinforcement-gated automatic attendance, unique results, clean completion, answer-free schedule, independent browse and knowledge/card return, old links/backup/spelling continuity, transient save and external revision protection, extra-sense context, 320/390/768/1440 and mobile 200% layout. No human usability or long-term memory claims.');
})().catch(error=>{console.error(error);process.exit(1);});
