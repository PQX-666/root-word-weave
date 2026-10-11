import fs from 'node:fs';
const file=new URL('../dist/atlas.js',import.meta.url);let s=fs.readFileSync(file,'utf8');s=s.replace('110+Math.ceil(ids.length/2)*76','145+Math.ceil(ids.length/2)*96').replace('Math.floor(i/2)*76','Math.floor(i/2)*96');fs.writeFileSync(file,s);console.log('Atlas spacing adjusted');
