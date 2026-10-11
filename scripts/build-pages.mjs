import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'_site');
// The only deletion target is this script's fixed build directory.
if(path.dirname(output)!==root.replace(/[\\/]$/,''))throw new Error('Unsafe build output path');
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(output,{recursive:true});
for(const entry of await fs.readdir(path.join(root,'dist'),{withFileTypes:true})){
  if(!entry.isFile())continue;
  await fs.copyFile(path.join(root,'dist',entry.name),path.join(output,entry.name));
}
await fs.copyFile(path.join(root,'adapters/browser-storage.js'),path.join(output,'storage.js'));
await fs.writeFile(path.join(output,'.nojekyll'),'');
console.log('GitHub Pages build ready in _site (browser-local progress, no API dependency).');
