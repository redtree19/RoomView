import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const url=process.argv[2]||'http://127.0.0.1:14320/RoomView/';
let server,browser;
try{
  if(!process.argv[2])await new Promise((resolve,reject)=>{
    server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir','dist-demo','--base','/RoomView/','--host','127.0.0.1','--port','14320','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
    const timeout=setTimeout(()=>reject(new Error('Demo preview startup timed out')),15000);
    server.stdout.on('data',s=>{if(s.toString().includes('14320')){clearTimeout(timeout);resolve();}});
    server.on('error',e=>{clearTimeout(timeout);reject(e);});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Demo preview exited: ${code}`));});
  });
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser=await chromium.launch({executablePath,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const errors=[],apiRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});
  const response=await page.goto(url);assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.roomview&&document.querySelector('#save-status')?.textContent.includes('浏览器'));
  assert.equal(await page.locator('.demo-notice').count(),1);
  assert.equal(await page.locator('#three-container canvas').evaluate(c=>Boolean(c.getContext('webgl2'))),true);
  const initial=await page.evaluate(()=>window.roomview.getScene().furniture.length);
  await page.getByRole('button',{name:'书桌',exact:false}).first().click();
  await page.locator('[data-field="height"]').fill('123');await page.locator('[data-field="height"]').press('Tab');
  assert.equal(await page.evaluate(()=>window.roomview.getScene().furniture.at(-1).height),123);
  await page.reload();await page.waitForFunction(()=>window.roomview);
  assert.equal(await page.evaluate(()=>window.roomview.getScene().furniture.length),initial+1);
  assert.equal(await page.evaluate(()=>window.roomview.getScene().furniture.at(-1).height),123);
  await page.locator('#ai-open').click();
  assert.equal(await page.locator('#modal-body a[href="/api/tools"]').count(),0);
  await page.getByRole('button',{name:'查看工具定义',exact:true}).click();
  assert.ok((await page.locator('#ai-result').textContent()).includes('roomview'));
  await page.locator('#ai-validate').click();assert.equal(await page.evaluate(()=>window.roomview.getScene().furniture.length),initial+1);
  await page.locator('#ai-execute').click();assert.equal(await page.evaluate(()=>window.roomview.getScene().furniture.length),initial+2);
  await page.locator('#modal-close').click();
  await page.locator('#export').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-export="json"]').click();
  const download=await downloadPromise;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(exported.furniture.length,initial+2);
  if(await page.locator('#modal').evaluate(e=>e.open))await page.locator('#modal-close').click();
  exported.name='Demo import check';
  await page.locator('#file-input').setInputFiles({name:'demo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await page.locator('#modal .primary').click();
  assert.equal(await page.evaluate(()=>window.roomview.getScene().name),'Demo import check');
  const other=await browser.newContext(),otherPage=await other.newPage();await otherPage.goto(url);await otherPage.waitForFunction(()=>window.roomview);
  assert.equal(await otherPage.evaluate(()=>window.roomview.getScene().furniture.length),initial,'Visitors must have independent layouts');await other.close();
  await mkdir(path.join(root,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-results','demo-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:path.join(root,'test-results','demo-mobile.png'),fullPage:true});
  await page.waitForTimeout(1800);
  assert.deepEqual(apiRequests,[],'Static demo must not poll a nonexistent HTTP API');
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${url} — WebGL, editing, browser persistence, visitor isolation, AI commands, JSON export/import, mobile layout, no API requests.`);
}finally{
  await browser?.close();
  if(server?.exitCode===null){const closed=new Promise(resolve=>server.once('exit',resolve));server.kill();await closed;}
}
