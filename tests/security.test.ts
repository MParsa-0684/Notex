import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {buildServer} from '../server/index.ts';import {applyPlan,agentContext,makeNote,cleanHtml,seal} from '../server/store.ts';import {emptyDoc,type Plan} from '../shared/types.ts';import {randomBytes,randomUUID} from 'node:crypto';
test('authentication, note encryption, passphrase locks, ownership, conflicts, and grant revocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'notex-test-'));const app=await buildServer({dir,test:true});let token='',grant='';
 const call=async(url:string,method:'GET'|'POST'|'PUT'='GET',payload?:unknown)=>{const r=await app.inject({url:'/api'+url,method,headers:{...(payload!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...(grant?{'x-note-unlock':grant}:{})},payload:payload===undefined?undefined:JSON.stringify(payload)});return{status:r.statusCode,data:r.json()};};
 try{
  assert.equal((await call('/workspace')).status,401);
  const owner=(await call('/auth/setup','POST',{name:'Owner',email:'owner@notex.test',password:'long account password'})).data;token=owner.token;
  const w=(await call('/workspace')).data,padId=w.pads[0].id;
  const n=(await call('/notes','POST',{padId,title:'Sensitive',doc:{...emptyDoc(),html:'<p>Private Persian فارسی content</p><script>alert(1)</script><img src="https://evil.test/pixel"/>'}})).data;
  assert.ok(!n.doc.html.includes('script'));assert.ok(!n.doc.html.includes('evil.test'));
  const stale=await call('/notes/'+n.id,'PUT',{title:n.title,padId,doc:n.doc,revision:0});assert.equal(stale.status,400);
  assert.equal((await call('/notes/'+n.id+'/lock','POST',{revision:n.revision,password:'separate note password'})).status,200);
  assert.equal((await call('/notes/'+n.id)).status,400);
  assert.ok(!JSON.stringify((await call('/workspace')).data).includes('Private Persian'));
  assert.equal((await call('/notes/'+n.id+'/unlock','POST',{password:'wrong password'})).status,400);
  const unlocked=(await call('/notes/'+n.id+'/unlock','POST',{password:'separate note password'})).data;grant=unlocked.grant;assert.match(unlocked.note.doc.html,/Private Persian/);
  assert.equal((await call('/notes/'+n.id)).status,200);
  const saved=(await call('/notes/'+n.id,'PUT',{title:n.title,padId,doc:{...n.doc,html:'<p>Protected update</p>'},revision:unlocked.note.revision})).data;assert.equal(saved.locked,true);
  await call('/auth/users','POST',{name:'Other',email:'other@notex.test',password:'other account password'});
  const second=(await call('/auth/login','POST',{email:'other@notex.test',password:'other account password'})).data;const ownerToken=token;token=second.token;
  assert.equal((await call('/notes/'+n.id)).status,400);assert.equal((await call('/workspace')).data.notes.length,0);
  assert.equal((await call('/auth/users','POST',{name:'No',email:'no@notex.test',password:'other account password'})).status,403);
  token=ownerToken;await call('/notes/'+n.id+'/close','POST');assert.equal((await call('/notes/'+n.id)).status,400);
  const disk=await readFile(join(dir,'users',owner.user.id+'.enc'),'utf8');assert.ok(!disk.includes('Protected update'));assert.ok(!disk.includes('separate note password'));
  grant='';await call('/auth/logout','POST');assert.equal((await call('/workspace')).status,401);
  assert.equal((await app.inject({url:'/api/auth/status',headers:{origin:'https://attacker.test'}})).statusCode,403);
 }finally{await app.close();}
});
test('agent context and mutations cannot read or bypass locked notes, even by guessing IDs',()=>{
 const padId=randomUUID(),open=makeNote(padId,'Open',{...emptyDoc(),html:'Visible'}),locked=makeNote(padId,'Secret title',{...emptyDoc(),html:'Secret content'});locked.locked=true;locked.content=seal(locked.content,randomBytes(32),'note:'+locked.id);
 const state={pads:[{id:padId,name:'Notes'}],notes:[open,locked]};const context=JSON.stringify(agentContext(state));assert.ok(!context.includes(locked.id));assert.ok(!context.includes('Secret'));
 for(const op of [{type:'update_note',id:locked.id,html:'hacked'},{type:'trash_note',id:locked.id},{type:'draw',id:locked.id,strokes:[]}])assert.throws(()=>applyPlan(structuredClone(state),{reply:'',operations:[op]} as Plan,{[locked.id]:1}),/forbidden/);
 assert.throws(()=>applyPlan(structuredClone(state),{reply:'',operations:[{type:'update_note',id:open.id,title:'Changed'}]},{[open.id]:0}),/changed/);
 const working=structuredClone(state);applyPlan(working,{reply:'',operations:[{type:'update_note',id:open.id,html:'<h2>Updated</h2>'}]},{[open.id]:1});assert.equal(working.notes[0].revision,2);assert.deepEqual(working.notes[1],locked);
});
test('HTML sanitizer strips script, event handlers, unsafe links and SVG images but retains editing primitives',()=>{
 const clean=cleanHtml('<table><tr><td>سلام</td></tr></table><img src="data:image/svg+xml;base64,AAAA" onerror="x"/><a href="javascript:alert(1)">bad</a><p style="position:fixed;color:#2196f3" onclick="evil()">Okay</p>');assert.match(clean,/<table>/);assert.match(clean,/#2196f3/);for(const s of ['javascript:','onerror','onclick','svg+xml','position:'])assert.ok(!clean.includes(s));
});
test('agent HTTP proposals need consent and approval; a subsequent lock blocks execution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'notex-agent-')),previousModel=process.env.OLLAMA_MODEL,originalFetch=globalThis.fetch;
 process.env.OLLAMA_MODEL='test-model';const app=await buildServer({dir,test:true});let token='',noteId='',context='',calls=0;
 globalThis.fetch=(async(_url,init)=>{calls++;context=String(init?.body);return new Response(JSON.stringify({message:{content:JSON.stringify({reply:'Proposed edit',operations:[{type:'update_note',id:noteId,html:'<p>Agent-approved content</p>'}]})}}),{status:200});}) as typeof fetch;
 const call=async(url:string,body?:unknown)=>{const r=await app.inject({url:'/api'+url,method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body!==undefined?{'content-type':'application/json'}:{})},payload:body===undefined?undefined:JSON.stringify(body)});return{status:r.statusCode,data:r.json()};};
 try{
  token=(await call('/auth/setup',{name:'Owner',email:'agent@notex.test',password:'a long test password'})).data.token;
  const padId=(await call('/workspace')).data.pads[0].id;
  const secret=(await call('/notes',{padId,title:'NEVER_SEND_TITLE',doc:{...emptyDoc(),html:'NEVER_SEND_CONTENT'}})).data;
  await call('/notes/'+secret.id+'/lock',{revision:secret.revision,password:'separate note password'});
  const note=(await call('/notes',{padId,title:'Editable'})).data;noteId=note.id;
  assert.equal((await call('/agent/plan',{message:'Edit',share:false})).status,400);assert.equal(calls,0);
  const proposed=(await call('/agent/plan',{message:'Edit',share:true})).data;
  assert.ok(!context.includes('NEVER_SEND'));assert.ok(!context.includes(secret.id));assert.ok(!context.includes('separate note password'));
  assert.ok(!(await call('/notes/'+noteId)).data.doc.html.includes('Agent-approved'));
  assert.equal((await call('/agent/apply',{planId:proposed.planId,confirm:false})).status,400);
  assert.equal((await call('/agent/apply',{planId:proposed.planId,confirm:true})).status,200);
  assert.match((await call('/notes/'+noteId)).data.doc.html,/Agent-approved/);
  assert.equal((await call('/agent/apply',{planId:proposed.planId,confirm:true})).status,400);
  const second=(await call('/agent/plan',{message:'Edit again',share:true})).data;
  const updated=(await call('/notes/'+noteId)).data;
  await call('/notes/'+noteId+'/lock',{revision:updated.revision,password:'another protected password'});
  assert.equal((await call('/agent/apply',{planId:second.planId,confirm:true})).status,400);
 }finally{globalThis.fetch=originalFetch;if(previousModel===undefined)delete process.env.OLLAMA_MODEL;else process.env.OLLAMA_MODEL=previousModel;await app.close();}
});
