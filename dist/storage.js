let revision=0;
let pendingSave=Promise.resolve();
export const storageLabel='学习记录保存在你的私有空间，可在手机和电脑间同步。也可导出文件备份。';
export async function loadState(){const r=await fetch('/api/progress',{cache:'no-store',credentials:'same-origin'});if(r.status===401)throw new Error('请使用你的 ChatGPT 账号打开这个私有应用。');if(!r.ok)throw new Error('学习记录暂时无法读取，请稍后重试。');const body=await r.json();revision=body.revision;return body.state;}
export function saveState(state){
  const snapshot=JSON.parse(JSON.stringify(state));
  const job=pendingSave.then(async()=>{let r;try{r=await fetch('/api/progress',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({revision,state:snapshot})});}catch{throw new Error('暂时无法确认记录是否已保存。请保持页面打开，联网后点“重试保存”或先导出备份。');}if(r.status===409)throw new Error('记录版本已变化，可能是上次保存已成功或其他设备更新。请先导出当前备份，再刷新读取最新进度。');if(!r.ok)throw new Error('记录暂未保存，请保持页面打开并重试。');revision=(await r.json()).revision;});
  pendingSave=job.catch(()=>{});return job;
}
