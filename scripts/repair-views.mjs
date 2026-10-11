import fs from 'node:fs';
function edit(f,old,v){const file=new URL('../'+f,import.meta.url),s=fs.readFileSync(file,'utf8');if(s.includes(v))return;if(!s.includes(old))throw Error('Missing '+f+' anchor');fs.writeFileSync(file,s.replace(old,v));}
edit('dist/word-card.js',"'<span class=\"tag\">${w.isAdditionalSense?'拓展义项':'暂未分级'}</span>'","`<span class=\"tag\">${w.isAdditionalSense?'拓展义项':'暂未分级'}</span>`");
edit('scripts/check-tools.cjs',"const origin='http://127.0.0.1:61517'","const origin='http://127.0.0.1:61518'");
edit('scripts/check-tools.cjs',"name:'port · 搬运，携带'","name:'port · 词族总览'");
console.log('Views and tool expectations repaired');
