import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../_site/',import.meta.url);
const entries=await fs.readdir(root);
assert.ok(entries.includes('index.html')&&entries.includes('library.json'));
assert.ok(!entries.includes('server')&&!entries.includes('.openai'));
const storage=await fs.readFile(new URL('storage.js',root),'utf8');
assert.ok(storage.includes('indexedDB'));
assert.ok(!storage.includes('/api/progress')&&!storage.includes('fetch('));
const index=await fs.readFile(new URL('index.html',root),'utf8');
assert.ok(index.includes('src="./app.js"'));
const lib=JSON.parse(await fs.readFile(new URL('library.json',root),'utf8'));
assert.equal(lib.families.length,104);
assert.equal(Object.keys(lib.words).length,1503);
for(const name of entries.filter(name=>name.endsWith('.js'))){
  const source=await fs.readFile(new URL(name,root),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))assert.ok(entries.includes(match[1].replace(/^\.\//,'')),name+' missing '+match[1]);
}
console.log('Pages artifact passed: all modules, 104 families / 1503 words, relative paths, browser storage, no cloud metadata.');
