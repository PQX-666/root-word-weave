import fs from 'node:fs';const at=f=>new URL('../'+f,import.meta.url),file=at('scripts/prepare-library.mjs');let src=fs.readFileSync(file,'utf8');
src=src.replace("const candidate=Object.values(cards).find(c=>c.label===p.text&&c.kind==='prefix')||",'const candidate=');
src=src.replace('isAdditionalSense:true,targets:sense.targets||[],core:true,senses:undefined,',"isAdditionalSense:true,targets:sense.targets||[],targetEvidence:sense.targetEvidence||[],meaningSource:sense.meaningSource||sense.source,synonymsDetailed:sense.synonymsDetailed,antonymsDetailed:sense.antonymsDetailed,teachingSteps:sense.teachingSteps,otherSenses:undefined,construction:sense.construction,posHint:sense.posHint,etymologyNote:sense.etymologyNote,core:true,senses:undefined,");
const guards=String.raw`
for(const w of [...Object.values(words),...Object.values(studyItems)]){
  if(w.ipa)for(const accent of ['uk','us'])if(!/^\/[^\/]+\/$/.test(w.ipa[accent]||'')||/dictionary|english|https?:|[?#_=]/.test(w.ipa[accent]||''))delete w.ipa[accent];
  if(['refine','resent','remove','remote'].includes(w.word))for(const p of w.parts)if(p.key==='re-back')delete p.key;
  const suffixes=w.parts.filter(p=>p.key&&cards[p.key]?.kind==='suffix');
  w.posHint=w.posHint||suffixes.map(p=>p.text+'：'+cards[p.key].outputPos).join('；')||('本卡学习的词性是 '+w.pos+'，结合句子中的位置与搭配判断。');
}
const un=words.unpredictable;
if(un){un.construction={parts:[{text:'un-',key:'un-negative',role:'prefix',meaning:'不；非'},{text:'predict',wordId:'predict',role:'base',meaning:'预测'},{text:'-able',key:'able-adj',role:'suffix',meaning:'能够被……的'}],groupStart:1,groupEnd:2};un.parts=un.construction.parts;un.posHint='-able 在这里构成形容词；un- 否定这个性质，词性仍是形容词。';un.etymologyNote='predict 的历史来源联系 pre-（提前）与 dict（说）。现代构词先理解 predictable，再由 un- 否定；两层线索分别理解。';}
`;
src=src.replace('const lib={version:2',guards+'\nconst lib={version:2');fs.writeFileSync(file,src,'utf8');
const appFile=at('dist/app.js');let app=fs.readFileSync(appFile,'utf8');app=app.replace("w.parts.some(p=>p.key===id)","w.parts.some(p=>p.key===id)||(c.kind==='root'&&w.families.includes(id.slice(5)))");fs.writeFileSync(appFile,app,'utf8');console.log('Catalog validation and separate sense content boundaries hardened.');
