import fs from 'node:fs';
const p=new URL('./prepare-library.mjs',import.meta.url);let s=fs.readFileSync(p,'utf8');s=s.replace('if(enrichment.familyGroups[f.id])f.groups=', 'if(enrichment.familyGroups[f.id]&&!supplementedGroups.has(f.id))f.groups=').replace('enrichedWordCount:Object.keys(enrichment.words).length','enrichedWordCount');fs.writeFileSync(p,s);
const r=new URL('../README.md',import.meta.url);fs.writeFileSync(r,fs.readFileSync(r,'utf8').replace('555 个独立词条','573 个独立词条'));
console.log('Supplemented family groups retain their semantic organization');
