import fs from 'node:fs';import assert from 'node:assert/strict';import {freshState} from '../dist/engine.js';import {renderWordCard} from '../dist/word-card.js';import {renderAtlas,atlasSVG} from '../dist/atlas.js';
const lib=JSON.parse(fs.readFileSync(new URL('../dist/library.json',import.meta.url),'utf8')),s=freshState();
for(const w of [...Object.values(lib.words),...Object.values(lib.studyItems)]){const html=renderWordCard(w.id,lib,s);assert.ok(html.includes('class="word-example"'));assert.ok(!html.includes('[object Object]'));assert.ok(!html.includes('>undefined<'));}
for(const f of lib.families){assert.ok(renderAtlas(f,lib,s).includes('词根知识卡'));assert.ok(atlasSVG(f,lib,s).includes('</svg>'));}
console.log('All word/sense cards and family maps render without invalid field values.');
