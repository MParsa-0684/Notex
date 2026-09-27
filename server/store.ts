import {createCipheriv,createDecipheriv,randomBytes,randomUUID,scrypt as derive} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';import {join} from 'node:path';
import sanitize from 'sanitize-html';import {docSchema,emptyDoc,type Doc,type Meta,type Pad,type Plan} from '../shared/types.ts';
export type Box={iv:string;tag:string;data:string};
export type RecordNote=Meta&{content:Doc|Box;salt?:string};
export type State={pads:Pad[];notes:RecordNote[]};
export function seal(value:unknown,key:Buffer,aad:string):Box{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return{iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')};}
export function unseal<T>(box:Box,key:Buffer,aad:string):T{const d=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));d.setAAD(Buffer.from(aad));d.setAuthTag(Buffer.from(box.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,'base64')),d.final()]).toString());}
export function passKey(password:string,salt:string,test=false):Promise<Buffer>{return new Promise((res,rej)=>derive(password,Buffer.from(salt,'base64'),32,{N:test?16384:131072,r:8,p:1,maxmem:192*1024*1024},(e,k)=>e?rej(e):res(k)));}
export async function dataKey(dir:string){await mkdir(dir,{recursive:true,mode:0o700});const configured=process.env.NOTEX_DATA_KEY;if(configured){const k=Buffer.from(configured,'base64');if(k.length!==32)throw Error('NOTEX_DATA_KEY must be 32 random bytes in base64');return k;}if(process.env.NODE_ENV==='production')throw Error('NOTEX_DATA_KEY is required');const path=join(dir,'development.key');try{return Buffer.from(await readFile(path,'utf8'),'base64');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const k=randomBytes(32);await writeFile(path,k.toString('base64'),{mode:0o600});return k;}}
export function cleanHtml(html:string){return sanitize(html,{allowedTags:['p','br','strong','b','em','i','s','u','h1','h2','h3','blockquote','pre','code','ul','ol','li','table','thead','tbody','tr','td','th','a','img','span','hr'],allowedAttributes:{'*':['dir','style'],a:['href','target','rel'],img:['src','alt','width','height'],td:['colspan','rowspan','colwidth'],th:['colspan','rowspan','colwidth']},allowedSchemes:['https','http','mailto'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,allowedStyles:{'*':{'color':[/^#[0-9a-f]{3,8}$/i,/^rgb\([\d ,]+\)$/],'background-color':[/^#[0-9a-f]{3,8}$/i,/^rgb\([\d ,]+\)$/],'text-align':[/^(left|right|center|justify)$/],'font-size':[/^\d{1,2}(px|pt)$/]}},transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}})},exclusiveFilter:frame=>frame.tag==='img'&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(frame.attribs.src??'')});}
export function cleanDoc(doc:Doc){const d=docSchema.parse(doc);return{...d,html:cleanHtml(d.html)};}
export function metadata(n:RecordNote):Meta{const{id,padId,title,locked,trashed,revision,updatedAt,createdAt}=n;return{id,padId,title,locked,trashed,revision,updatedAt,createdAt};}
export function makeNote(padId:string,title:string,doc=emptyDoc()):RecordNote{const now=new Date().toISOString();return{id:randomUUID(),padId,title,locked:false,trashed:false,revision:1,createdAt:now,updatedAt:now,content:cleanDoc(doc)};}
export function touch(n:RecordNote){n.revision++;n.updatedAt=new Date().toISOString();}
export class Store{
 private queues=new Map<string,Promise<unknown>>();
 constructor(private dir:string,private key:Buffer){}
 async read(user:string):Promise<State>{if(!/^[\da-f-]{36}$/.test(user))throw Error('Invalid account');try{return unseal(JSON.parse(await readFile(join(this.dir,user+'.enc'),'utf8')),this.key,'notex:'+user);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return{pads:[{id:'00000000-0000-4000-8000-000000000001',name:'My notes'}],notes:[]};throw e;}}
 async mutate<T>(user:string,fn:(s:State)=>T|Promise<T>):Promise<T>{const work=(this.queues.get(user)??Promise.resolve()).catch(()=>{}).then(async()=>{const s=await this.read(user),result=await fn(s);if(s.notes.length>500||s.pads.length>50||Buffer.byteLength(JSON.stringify(s))>40000000)throw Error('Workspace limit reached (500 notes / 50 pads / 40 MB).');await mkdir(this.dir,{recursive:true,mode:0o700});const file=join(this.dir,user+'.enc'),temp=file+'.'+randomUUID();await writeFile(temp,JSON.stringify(seal(s,this.key,'notex:'+user)),{mode:0o600});await rename(temp,file);return result;});this.queues.set(user,work);try{return await work;}finally{if(this.queues.get(user)===work)this.queues.delete(user);}}
}
export function agentContext(state:State){return{pads:state.pads,notes:state.notes.filter(n=>!n.locked&&!n.trashed).slice(0,50).map(n=>({...metadata(n),html:(n.content as Doc).html.replace(/<img[^>]*>/g,'[image omitted]').slice(0,12000)}))};}
export function applyPlan(state:State,plan:Plan,expected:Record<string,number>){
 for(const op of plan.operations){
  if('id'in op&&op.type!=='rename_pad'){const n=state.notes.find(n=>n.id===op.id);if(!n||n.locked||n.trashed)throw Error('Agent access to locked, missing, or trashed notes is forbidden.');if(n.revision!==expected[n.id])throw Error('A note changed after this plan was prepared. Ask the agent again.');}
  if('padId'in op&&op.padId&&!state.pads.some(p=>p.id===op.padId))throw Error('Pad no longer exists.');
 }
 for(const op of plan.operations){
  if(op.type==='create_pad'){state.pads.push({id:randomUUID(),name:op.name});continue;}
  if(op.type==='rename_pad'){const p=state.pads.find(p=>p.id===op.id);if(!p)throw Error('Pad not found');p.name=op.name;continue;}
  if(op.type==='create_note'){state.notes.unshift(makeNote(op.padId,op.title,{...emptyDoc(),html:op.html}));continue;}
  const n=state.notes.find(n=>n.id===op.id)!;
  if(op.type==='trash_note')n.trashed=true;
  if(op.type==='update_note'){if(op.title)n.title=op.title;if(op.padId)n.padId=op.padId;const d=n.content as Doc;if(op.html!==undefined)d.html=cleanHtml(op.html);if(op.paper)d.paper=op.paper;}
  if(op.type==='draw'){const d=n.content as Doc;d.strokes.push(...op.strokes);d.view='board';n.content=cleanDoc(d);}
  touch(n);
 }
}
