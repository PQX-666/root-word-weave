// Pages has no server: each browser keeps its own progress in IndexedDB.
// A revision check and an atomic transaction protect concurrent tabs.
export const storageLabel='学习记录保存在当前浏览器中。更换设备、使用无痕模式或清除网站数据前，请先导出备份；可在其他设备导入继续学习。';

export function createBrowserStorage({indexedDB=globalThis.indexedDB,name='root-word-weave:'+new URL('.',globalThis.location?.href||'https://local.invalid/').pathname}={}){
  let revision=0,database,pendingSave=Promise.resolve();
  const conflict='另一个页面已更新学习记录。请先导出当前备份，再刷新读取最新进度。';
  const message=error=>error?.name==='QuotaExceededError'?'浏览器存储空间不足，记录暂未保存。请先导出当前备份。':'当前浏览器暂时无法保存记录。请保持页面打开，重试保存或导出当前备份。';
  function open(){
    if(!indexedDB)return Promise.reject(new Error('当前浏览器无法使用本地存储。请用普通模式打开，并允许网站保存数据。'));
    if(!database)database=new Promise((resolve,reject)=>{
      let request,abandoned=false;
      try{request=indexedDB.open(name,1);}catch(error){reject(new Error(message(error)));return;}
      request.onupgradeneeded=()=>request.result.createObjectStore('progress');
      request.onerror=()=>{abandoned=true;reject(new Error(message(request.error)));};
      request.onblocked=()=>{abandoned=true;reject(new Error('请关闭这个应用的其他页面，再重新加载。'));};
      request.onsuccess=()=>{const db=request.result;if(abandoned){db.close();return;}db.onversionchange=()=>{db.close();database=undefined;};db.onclose=()=>{database=undefined;};resolve(db);};
    }).catch(error=>{database=undefined;throw error;});
    return database;
  }
  function envelope(record){
    if(record===undefined)return {revision:0,state:null};
    if(!record||!Number.isSafeInteger(record.revision)||record.revision<1||!record.state||typeof record.state!=='object'||Array.isArray(record.state))throw new Error('本地学习记录格式异常，已停止写入以保留原记录。');
    return record;
  }
  async function loadState(){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('progress','readonly'),request=transaction.objectStore('progress').get('state');
      let record;
      request.onsuccess=()=>{try{record=envelope(request.result);}catch(error){reject(error);}};
      transaction.oncomplete=()=>{if(!record)return;revision=record.revision;resolve(record.state);};
      transaction.onerror=transaction.onabort=()=>reject(new Error(message(transaction.error)));
    });
  }
  function saveState(state){
    // Snapshot before entering the queue: later UI mutations cannot alter it.
    const snapshot=JSON.parse(JSON.stringify(state));
    const job=pendingSave.then(async()=>{
      const db=await open();
      return new Promise((resolve,reject)=>{
        const transaction=db.transaction('progress','readwrite'),store=transaction.objectStore('progress'),request=store.get('state');
        let failure,nextRevision;
        request.onsuccess=()=>{
          try{
            const previous=envelope(request.result);
            if(previous.revision!==revision)throw new Error(conflict);
            nextRevision=revision+1;
            store.put({revision:nextRevision,state:snapshot},'state');
          }catch(error){failure=error.name==='Error'?error:new Error(message(error));transaction.abort();}
        };
        transaction.oncomplete=()=>{revision=nextRevision;resolve();};
        transaction.onerror=transaction.onabort=()=>reject(failure||new Error(message(transaction.error)));
      });
    });
    pendingSave=job.catch(()=>{});
    return job;
  }
  return {loadState,saveState};
}

const browserStorage=createBrowserStorage();
export const loadState=browserStorage.loadState;
export const saveState=browserStorage.saveState;
