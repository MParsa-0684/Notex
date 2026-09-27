import {chromium} from 'playwright-core';import {readFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const [source,folder] of [['public/icons/notex.svg','public/icons'],['../Portfolio/public/icons/portfolio.svg','../Portfolio/public/icons']]){
 const svg=await readFile(source,'utf8');await mkdir(folder,{recursive:true});
 for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180],['maskable-512.png',512]]){
  const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});await page.setContent(`<style>html,body{margin:0;background:#0d47a1}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);await page.screenshot({path:resolve(folder,name)});await page.close();
 }
} }finally{await browser.close();}
