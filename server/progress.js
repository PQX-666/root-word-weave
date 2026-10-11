export function createProgressHandler(library,validate){
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
  const dbFor=env=>{if(!env.DB?.prepare)throw new Error('Progress storage unavailable');return env.DB;};
  return async function progress(request,env){
    const user=request.headers.get('oai-authenticated-user-id');
    if(!user)return json({error:'authentication_required'},401);
    try{
      const db=dbFor(env);
      if(request.method==='GET'){
        const row=await db.prepare('SELECT state_json, revision FROM learning_state WHERE user_id = ?').bind(user).first();
        return json(row?{state:JSON.parse(row.state_json),revision:row.revision}:{state:null,revision:0});
      }
      if(request.method!=='PUT')return json({error:'method_not_allowed'},405);
      if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'origin_mismatch'},403);
      if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'origin_mismatch'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'json_required'},415);
      const text=await request.text();if(text.length>3000000)return json({error:'payload_too_large'},413);
      let input,state;try{input=JSON.parse(text);if(!Number.isInteger(input.revision)||input.revision<0)throw new Error();state=validate(input.state,library);}catch{return json({error:'invalid_progress'},400);}
      const serialized=JSON.stringify(state),revision=input.revision+1;
      const statement=input.revision===0?db.prepare('INSERT INTO learning_state (user_id, state_json, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING').bind(user,serialized,Date.now()):db.prepare('UPDATE learning_state SET state_json = ?, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(serialized,revision,Date.now(),user,input.revision);
      const result=await statement.run();
      if(result.meta?.changes!==1)return json({error:'revision_conflict'},409);
      return json({revision});
    }catch(error){console.error('Progress storage request failed',error?.message);return json({error:'storage_unavailable'},503);}
  };
}
