const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const origin=new URL(process.env.PAGES_QA_ORIGIN||'http://127.0.0.1:4177/root-word-weave/');
const output=path.resolve(__dirname,'../test-output/pages');
// This test creates isolated browser profiles and imports synthetic progress.
// It intentionally refuses a real hosted URL or the owner's browser profile.
assert.ok(['127.0.0.1','localhost','[::1]'].includes(origin.hostname),'Run state-changing Pages QA only on a local preview.');
assert.ok(origin.pathname.endsWith('/'),'PAGES_QA_ORIGIN must include the trailing slash.');

(async()=>{
 const E=await import('../dist/engine.js'),M=await import('../dist/meaning-engine.js');
 const lib=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../dist/library.json'),'utf8'));
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const contexts=[],errors=[],apiRequests=[],failedRequests=[];
 function observe(page){
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')||new URL(request.url()).pathname.includes('/api/'))apiRequests.push(request.url());});
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
 }
 async function newContext(viewport={width:1440,height:1000}){
  const context=await browser.newContext({viewport,acceptDownloads:true});contexts.push(context);
  context.on('page',observe);return context;
 }
 const context=await newContext(),page=await context.newPage();
 async function ready(p=page){
  await p.locator('#main').waitFor();
  await p.waitForFunction(()=>document.querySelector('#main')?.children.length&&!document.querySelector('#main .loading'));
 }
 async function go(route='today',p=page){await p.goto(origin.href+'#'+route);await ready(p);}
 async function snapshot(p=page){
  return p.evaluate(()=>new Promise((resolve,reject)=>{
   const name='root-word-weave:'+new URL('.',location.href).pathname,request=indexedDB.open(name,1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('progress','readonly'),get=tx.objectStore('progress').get('state');let record;
    get.onsuccess=()=>{record=get.result;};
    tx.oncomplete=()=>{db.close();resolve(record||{revision:0,state:null});};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Snapshot transaction aborted'));};
   };
  }));
 }
 async function saved(test,p=page){
  for(let i=0;i<120;i++){const result=await snapshot(p);if(test(result.state,result))return result;await p.waitForTimeout(50);}
  throw Error('Expected committed browser progress did not arrive');
 }
 async function importState(state,p=page){
  E.validateState(state,lib);await go('me',p);
  p.once('dialog',dialog=>dialog.accept());
  await p.locator('#backup-file').setInputFiles({name:'synthetic-progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'词根织网',state}))});
  await saved(s=>s?.settings.target===state.settings.target&&s.bookmarks.join(',')===state.bookmarks.join(',')&&s.meaningEvents.length===(state.meaningEvents?.length||0),p);
  await p.getByRole('alert').waitFor({state:'hidden'});
 }
 async function hidden(id,p=page){
  await p.locator('.meaning-page[data-meaning-phase="hidden"]'+(id?'[data-meaning-word="'+id+'"]':'')).waitFor();
  assert.equal(await p.locator('.meaning-answer,.meaning-page .reader-definition,.meaning-page .reader-association').count(),0);
  const current=await p.locator('.meaning-page').getAttribute('data-meaning-word'),w=E.studyItem(lib,current),text=await p.locator('.meaning-page').innerText();
  for(const answer of [w.meaning,w.mnemonic,w.examples[0].translation])assert.ok(!text.includes(answer),'Hidden card leaks '+current+' answer');
  return current;
 }
 async function reveal(p=page){await p.locator('[data-action="meaning-reveal"]:not([disabled])').click();await p.locator('.meaning-answer').waitFor();await p.locator('[data-action="meaning-grade"]:not([disabled])').first().waitFor();}
 async function grade(value,p=page){
  const token=await p.locator('[data-action="meaning-grade"]').first().getAttribute('data-token');
  await p.locator('[data-action="meaning-grade"][data-grade="'+value+'"]').click();
  await saved(s=>s.meaningEvents.some(event=>event.id===token),p);return token;
 }
 async function exportState(p=page){
  await go('me',p);const waiting=p.waitForEvent('download');await p.locator('[data-action="backup"]').click();
  const download=await waiting;return JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 }
 const shot=async(name,p=page)=>p.screenshot({path:path.join(output,name+'.png'),fullPage:true});

 try{
  await go();await page.locator('.today-family').waitFor();await saved(s=>!!s);
  assert.equal(await page.locator('input[type="password"]').count(),0,'Public Pages requires no login');
  await go('families');assert.equal(await page.locator('.family-card').count(),104);
  await go('family/act');await page.locator('.atlas-scroll').waitFor();await shot('atlas-desktop');
  await go('knowledge');await page.locator('.knowledge-card').first().waitFor();
  await go('me');assert.ok((await page.locator('#main').innerText()).includes('学习记录保存在当前浏览器中'));
  const seed=E.freshState();seed.settings.target=3;seed.bookmarks=['act'];E.ensureDay(seed,lib);M.ensureMeaningDay(seed,lib);M.chooseMeaningFamily(seed,lib,'act');
  await importState(seed);await go();await page.getByRole('link',{name:'开始学习',exact:true}).click();await hidden('act');await shot('front-desktop');
  await reveal();await shot('back-desktop');await page.reload();await page.locator('.meaning-answer').waitFor();
  assert.equal(await page.locator('.meaning-page').getAttribute('data-meaning-word'),'act','Reload retains revealed card');
  const beforeGrade=await snapshot();await grade('clear');const next=await hidden();assert.notEqual(next,'act');
  let after=await snapshot();assert.equal(after.state.meaningEvents.length,beforeGrade.state.meaningEvents.length+1);
  assert.equal(after.state.meanings.act.lastGrade,'clear');assert.equal(after.state.meanings.act.intervalDays,1);
  assert.equal(E.dayKey(after.state.meanings.act.due),E.dayKey(Date.now()+86400000),'First score schedules the next Shanghai day');
  await page.reload();await hidden(next);assert.equal((await snapshot()).state.meaningSession.queue[0].id,next);
  const backup=await exportState();assert.equal(backup.app,'词根织网');E.validateState(backup.state,lib);
  assert.equal(backup.state.meanings.act.lastGrade,'clear');fs.writeFileSync(path.join(output,'synthetic-export.json'),JSON.stringify(backup,null,2));

  // Contexts have independent storage despite sharing the public URL.
  const independent=await newContext(),other=await independent.newPage();await go('me',other);await saved(s=>!!s,other);
  const freshOther=await snapshot(other);assert.equal(freshOther.state.meaningEvents.length,0);assert.deepEqual(freshOther.state.bookmarks,[]);
  await importState(backup.state,other);const imported=await snapshot(other);
  assert.deepEqual(imported.state.meanings,backup.state.meanings);assert.deepEqual(imported.state.meaningSession,backup.state.meaningSession);
  await other.reload();await ready(other);assert.deepEqual((await snapshot(other)).state.meanings,backup.state.meanings);
  assert.equal((await snapshot()).state.meaningEvents.length,1,'Second browser import does not mutate first browser');

  // Invalid content is rejected before replacement confirmation or a write.
  const invalid=structuredClone(backup.state);invalid.settings.target=-1;
  const beforeInvalid=await snapshot(other);let confirmed=false;
  const dismiss=dialog=>{confirmed=true;dialog.dismiss();};other.on('dialog',dismiss);
  await other.locator('#backup-file').setInputFiles({name:'invalid-progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'词根织网',state:invalid}))});
  await other.locator('#toast').waitFor({state:'visible'});assert.ok((await other.locator('#toast').innerText()).includes('学习量'));
  other.removeListener('dialog',dismiss);assert.equal(confirmed,false);assert.deepEqual(await snapshot(other),beforeInvalid);await shot('invalid-import',other);

  // Prior cloud backups without meaning fields still import with fresh defaults.
  const old=E.freshState();old.settings.target=9;old.bookmarks=['active'];for(const key of ['meanings','meaningDays','meaningEvents','meaningSession'])delete old[key];
  await importState(old,other);after=await snapshot(other);assert.equal(after.state.meaningEvents.length,0);assert.deepEqual(after.state.meanings,{});
  await independent.close();

  // Both tabs begin from a revision; the second tab's commit makes the first
  // stale. Failed save and retry must not overwrite the newer committed state.
  await go('me');const tab=await context.newPage();await go('me',tab);await saved(s=>!!s,tab);
  await tab.locator('#target').selectOption('9');await saved(s=>s.settings.target===9,tab);
  const beforeConflict=await snapshot();await page.locator('#encouragement').selectOption('plain');
  await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('另一个页面已更新'));
  assert.deepEqual(await snapshot(),beforeConflict);await page.locator('[data-action="retry"]').click();await page.getByRole('alert').waitFor();
  assert.deepEqual(await snapshot(),beforeConflict,'Retry does not overwrite a later tab revision');
  const unsaved=await exportState();assert.equal(unsaved.state.settings.encouragement,'plain','Export retains unsaved local changes');
  await shot('conflict-protection');await page.reload();await ready();assert.equal(await page.locator('#target').inputValue(),'9');assert.equal(await page.locator('#encouragement').inputValue(),'warm');await tab.close();

  // Abort a single browser storage transaction without changing committed data.
  // The rating stays in this page and retry commits it exactly once.
  await go('read');await hidden(next);await reveal();const beforeFailure=await snapshot();
  await page.evaluate(()=>{
   const native=IDBDatabase.prototype.transaction;
   window.__pagesQaTransaction=native;window.__pagesQaAbort=true;
   IDBDatabase.prototype.transaction=function(...args){const tx=native.apply(this,args);if(args[1]==='readwrite'&&window.__pagesQaAbort){window.__pagesQaAbort=false;queueMicrotask(()=>tx.abort());}return tx;};
  });
  await page.locator('[data-action="meaning-grade"][data-grade="clear"]').click();await page.getByRole('alert').waitFor();
  assert.ok((await page.getByRole('alert').innerText()).includes('暂时无法保存记录'));assert.deepEqual(await snapshot(),beforeFailure);
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=window.__pagesQaTransaction;delete window.__pagesQaTransaction;delete window.__pagesQaAbort;});
  await page.locator('[data-action="retry"]').click();after=await saved(s=>s.meaningEvents.length===beforeFailure.state.meaningEvents.length+1);
  assert.equal(after.state.meaningSession.queue[0].id,await hidden());await page.getByRole('alert').waitFor({state:'hidden'});await shot('retry-saved');

  // Adapter-level tests use separate throwaway databases, never the app's DB.
  const atomic=await page.evaluate(async()=>{
   const {createBrowserStorage}=await import('./storage.js');
   const prefix='pages-qa-'+crypto.randomUUID();
   const a=createBrowserStorage({name:prefix+'-concurrent'}),b=createBrowserStorage({name:prefix+'-concurrent'});
   await Promise.all([a.loadState(),b.loadState()]);
   const results=await Promise.allSettled([a.saveState({writer:'A'}),b.saveState({writer:'B'})]);
   const winning=await createBrowserStorage({name:prefix+'-concurrent'}).loadState();
   const serial=createBrowserStorage({name:prefix+'-snapshots'});await serial.loadState();
   const original={stage:1,nested:{value:'original'}},queued=serial.saveState(original);original.stage=99;original.nested.value='mutated';await queued;
   const immutable=await createBrowserStorage({name:prefix+'-snapshots'}).loadState();
   const values=[];
   for(let i=0;i<4;i++){const value={stage:i};values.push(serial.saveState(value));value.stage=100;}
   await Promise.all(values);const ordered=await serial.loadState();
   let unavailable='';try{await createBrowserStorage({indexedDB:null,name:prefix+'-unsupported'}).loadState();}catch(error){unavailable=error.message;}
   // IndexedDB can throw before returning a request (for example when storage
   // permissions change). A rejected open must not poison all later retries.
   let synchronousCalls=0,synchronousError='';
   const retrySync=createBrowserStorage({name:prefix+'-sync-retry',indexedDB:{open(...args){synchronousCalls++;if(synchronousCalls===1)throw new DOMException('QA temporary storage restriction','SecurityError');return indexedDB.open(...args);}}});
   try{await retrySync.loadState();}catch(error){synchronousError=error.message;}
   const syncEmpty=await retrySync.loadState();await retrySync.saveState({recovered:'synchronous'});const syncSaved=await retrySync.loadState();
   // The asynchronous error path must likewise discard the failed request.
   let asynchronousCalls=0,asynchronousError='';
   const retryAsync=createBrowserStorage({name:prefix+'-async-retry',indexedDB:{open(...args){asynchronousCalls++;if(asynchronousCalls===1){const request={error:new DOMException('QA asynchronous open failure','UnknownError')};queueMicrotask(()=>request.onerror?.());return request;}return indexedDB.open(...args);}}});
   try{await retryAsync.loadState();}catch(error){asynchronousError=error.message;}
   const asyncEmpty=await retryAsync.loadState();await retryAsync.saveState({recovered:'asynchronous'});const asyncSaved=await retryAsync.loadState();
   // A synchronous quota failure during put is translated, rolls back the
   // transaction, and leaves the save queue available for another attempt.
   const quota=createBrowserStorage({name:prefix+'-quota-retry'});await quota.loadState();
   const nativePut=IDBObjectStore.prototype.put;let quotaError='';
   try{
    IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===prefix+'-quota-retry')throw new DOMException('QA storage exhausted','QuotaExceededError');return nativePut.apply(this,args);};
    try{await quota.saveState({recovered:'quota'});}catch(error){quotaError=error.message;}
   }finally{IDBObjectStore.prototype.put=nativePut;}
   const quotaEmpty=await quota.loadState();await quota.saveState({recovered:'quota'});const quotaSaved=await quota.loadState();
   return {outcomes:results.map(x=>x.status),rejections:results.filter(x=>x.status==='rejected').map(x=>x.reason.message),winning,immutable,ordered,unavailable,synchronousCalls,synchronousError,syncEmpty,syncSaved,asynchronousCalls,asynchronousError,asyncEmpty,asyncSaved,quotaError,quotaEmpty,quotaSaved};
  });
  assert.equal(atomic.outcomes.filter(x=>x==='fulfilled').length,1);assert.equal(atomic.outcomes.filter(x=>x==='rejected').length,1);
  assert.ok(atomic.rejections[0].includes('另一个页面已更新'));assert.ok(['A','B'].includes(atomic.winning.writer));
  assert.deepEqual(atomic.immutable,{stage:1,nested:{value:'original'}});assert.deepEqual(atomic.ordered,{stage:3});assert.ok(atomic.unavailable.includes('无法使用本地存储'));
  assert.equal(atomic.synchronousCalls,2);assert.ok(atomic.synchronousError.includes('当前浏览器暂时无法保存记录'));assert.equal(atomic.syncEmpty,null);assert.deepEqual(atomic.syncSaved,{recovered:'synchronous'});
  assert.equal(atomic.asynchronousCalls,2);assert.ok(atomic.asynchronousError.includes('当前浏览器暂时无法保存记录'));assert.equal(atomic.asyncEmpty,null);assert.deepEqual(atomic.asyncSaved,{recovered:'asynchronous'});
  assert.ok(atomic.quotaError.includes('浏览器存储空间不足'));assert.equal(atomic.quotaEmpty,null);assert.deepEqual(atomic.quotaSaved,{recovered:'quota'});

  await page.setViewportSize({width:390,height:844});await go('today');await shot('today-mobile');await go('read');await hidden();await shot('front-mobile');await reveal();
  const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,height:innerHeight,buttons:[...document.querySelectorAll('.meaning-controls button')].map(button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom,touchable:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===button};})}));
  assert.ok(layout.width<=layout.viewport,'390 px page does not overflow');for(const button of layout.buttons){assert.ok(button.top>=0&&button.bottom<=layout.height,'Mobile recall controls stay visible');assert.ok(button.touchable);}
  await shot('back-mobile');await go('me');assert.ok(await page.locator('[data-action="backup"]').isVisible());await shot('me-mobile');
  assert.deepEqual(errors,[],'No browser runtime exceptions');assert.deepEqual(apiRequests,[],'Pages never calls the authenticated cloud API');assert.deepEqual(failedRequests,[],'Local Pages assets load without failed requests');
  console.log('Pages browser QA passed: public no-login/no-API routes, 104 families, hidden recall/reveal/grade, next-day scheduling and reload persistence, current/legacy backup import/export, invalid backup non-mutation, isolated browser progress, two-tab revision protection, aborted save and retry, atomic IndexedDB writes, immutable ordered snapshots, unsupported storage message, synchronous/asynchronous open recovery, quota rollback/retry, and 390 px touch layout. Synthetic local profiles only.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
