// Cross-app smoke test against temporary accounts/data, never the real workspace.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {SecurePlanNetClient} from '../../PlanNet/app/lib/secure-client.ts';
import {normalizeAction} from '../../PlanNet/app/lib/state.ts';
const services=[];let browser;
const start=(cwd,args,env)=>{const p=spawn('node',args,{cwd,env:{...process.env,...env},stdio:'pipe'});let logs='';p.stderr.on('data',d=>logs+=d);p.on('exit',code=>{if(code)console.error(logs.slice(-2000));});services.push(p);};
async function ready(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Service did not start: '+url);}
try{
 const data=await mkdtemp(join(tmpdir(),'notex-plannet-'));
 start(resolve('../PlanNet'),['--import','tsx','server/index.ts'],{PLANNET_PORT:'8812',PLANNET_DATA_DIR:join(data,'plannet'),PLANNET_ALLOWED_ORIGINS:'http://127.0.0.1:5193,http://127.0.0.1:8911'});
 start(resolve('../PlanNet'),['dist/standalone/server.js'],{PORT:'5193',HOST:'127.0.0.1'});
 start(process.cwd(),['--import','tsx','server/index.ts'],{PORT:'8911',NOTEX_DATA_DIR:join(data,'notex'),NOTEX_ORIGINS:'http://127.0.0.1:8911'});
 await Promise.all([ready('http://127.0.0.1:8812/health'),ready('http://127.0.0.1:5193'),ready('http://127.0.0.1:8911/api/health')]);
 const client=new SecurePlanNetClient('http://127.0.0.1:8812');await client.registerOwner('Graph tester','graph@test.example','temporary graph password');
 const a=normalizeAction({title:'Completed first step',completed:true}),b=normalizeAction({title:'Remaining step',dependencyIds:[a.id]}),c=normalizeAction({title:'Finished isolated node',completed:true}),d=normalizeAction({title:'Finished group root',completed:true}),e=normalizeAction({title:'Finished group child',completed:true,dependencyIds:[d.id]});
 await client.saveState({version:1,actions:[a,b,c,d,e],tags:[],updatedAt:new Date().toISOString()});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('plannet-api-url','http://127.0.0.1:8812'));
 await page.goto('http://127.0.0.1:5193');await page.getByLabel('Email address').fill('graph@test.example');await page.getByLabel('Password',{exact:true}).fill('temporary graph password');await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
 await page.getByRole('button',{name:'Graph',exact:true}).click();await page.locator('[data-graph-node-id]').first().waitFor();assert.equal(await page.locator('[data-graph-node-id]').count(),2);
 const pa=await page.locator(`[data-graph-node-id="${a.id}"]`).boundingBox(),pb=await page.locator(`[data-graph-node-id="${b.id}"]`).boundingBox();assert.ok(pb.y>pa.y);assert.equal(pa.x,pb.x);
 await page.getByRole('button',{name:'Expand graph',exact:true}).click();assert.ok(await page.locator('.workspace').evaluate(e=>e.classList.contains('graph-expanded')));
 for(let i=0;i<12;i++){const out=page.getByRole('button',{name:'Zoom out',exact:true});if(await out.isDisabled())break;await out.click();}assert.ok(await page.getByRole('button',{name:'Zoom out',exact:true}).isDisabled());assert.match(await page.locator('[aria-label="Zoom controls"]').innerText(),/15%/);
 await page.getByRole('button',{name:'List',exact:true}).click();assert.equal(await page.locator('[data-graph-node-id]').count(),0);
 const note=await browser.newPage({viewport:{width:1440,height:960}});note.on('pageerror',e=>errors.push(e.message));await note.goto('http://127.0.0.1:8911');await note.getByLabel('Your name').fill('Notes tester');await note.getByLabel('Email',{exact:true}).fill('notes@test.example');await note.getByLabel('Password',{exact:true}).fill('temporary notes password');await note.getByRole('button',{name:'Create my workspace'}).click();await note.getByRole('button',{name:'New note',exact:true}).click();await note.getByRole('button',{name:'Insert PlanNet action link',exact:true}).click();
 await note.getByLabel('PlanNet API').fill('http://127.0.0.1:8812');await note.getByLabel('PlanNet website').fill('http://127.0.0.1:5193');await note.getByLabel('PlanNet email').fill('graph@test.example');await note.getByLabel('PlanNet password').fill('temporary graph password');await note.getByRole('button',{name:'Load my actions'}).click();await note.getByRole('button',{name:'○ Remaining step'}).click();
 const href=await note.locator('.tiptap a').getAttribute('href');assert.equal(new URL(href).searchParams.get('action'),b.id);
 // Opening the selected action must survive a fresh authentication, not bypass it.
 await page.goto(href);await page.getByLabel('Email address').fill('graph@test.example');await page.getByLabel('Password',{exact:true}).fill('temporary graph password');await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
 await page.locator('input[value="Remaining step"]').waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: vertical graph, completed component/isolated-node hiding, expand, 15% zoom, PlanNet picker, authenticated deep link, no browser errors.');
}finally{await browser?.close();for(const p of services)p.kill('SIGTERM');}
