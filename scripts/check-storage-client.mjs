import assert from 'node:assert/strict';
import {loadState,saveState} from '../dist/storage.js';
let revision=0,requests=[],release;
globalThis.fetch=async(url,options={})=>{
  if(!options.method)return Response.json({revision,state:null});
  const body=JSON.parse(options.body);requests.push(body);
  if(requests.length===1)await new Promise(resolve=>release=resolve);
  if(body.revision!==revision)return new Response('',{status:409});
  return Response.json({revision:++revision});
};
await loadState();const state={value:1},first=saveState(state);state.value=2;const second=saveState(state);state.value=3;
await Promise.resolve();assert.equal(requests.length,1);assert.equal(requests[0].state.value,1);release();await Promise.all([first,second]);
assert.deepEqual(requests.map(r=>[r.revision,r.state.value]),[[0,1],[1,2]]);
revision++;await assert.rejects(saveState(state),/上次保存已成功或其他设备更新/);
await loadState();await saveState(state);assert.equal(requests.at(-1).state.value,3);
// A committed request can lose its response. Retrying the old revision must
// preserve the server state and explain both possible causes of a conflict.
let loseResponse=true,serverState={value:3};
globalThis.fetch=async(url,options={})=>{
  if(!options.method)return Response.json({revision,state:serverState});
  const body=JSON.parse(options.body);
  if(body.revision!==revision)return new Response('',{status:409});
  serverState=body.state;revision++;
  if(loseResponse){loseResponse=false;throw new TypeError('Response lost');}
  return Response.json({revision});
};
const uncertain={value:4};await assert.rejects(saveState(uncertain),/无法确认记录是否已保存/);
assert.deepEqual(serverState,uncertain);const committedRevision=revision;
await assert.rejects(saveState({value:5}),/上次保存已成功或其他设备更新/);
assert.equal(revision,committedRevision);assert.deepEqual(serverState,uncertain);
assert.deepEqual(await loadState(),uncertain);await saveState({value:5});assert.equal(serverState.value,5);
console.log('Client storage passed: ordered writes, immutable snapshots, external conflicts, lost responses, reload and retry.');
