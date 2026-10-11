import fs from 'node:fs';
const file=new URL('../dist/app.js',import.meta.url);let s=fs.readFileSync(file,'utf8');
s=s.replace('今日计划 ${d.target} 个新词','今日计划 ${d.target} 个新学项').replace('新词 ${p.newDone}','新学项 ${p.newDone}').replace('今天要认识的词','今天要认识的词与义项').replace('>${esc(id)}${d.completed.includes(id)',">${esc(E.studyItem(lib,id).word)}${E.studyItem(lib,id).isAdditionalSense?' · 新义项':''}${d.completed.includes(id)").replace('每日新词数量','每日新学项数量').replace("document.querySelector('.graph-window')","document.querySelector('.atlas-scroll')");
fs.writeFileSync(file,s);console.log('Learning labels updated');
