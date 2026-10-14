import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
const root=path.resolve(import.meta.dirname,'..');
test('HTTP API validates revisions, dry run, atomicity, origin and disk persistence',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'roomview-api-')),port=14319;
  let server;
  const launch=()=>new Promise((resolve,reject)=>{server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ROOMVIEW_DATA_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.on('data',s=>{if(s.toString().includes('ready:'))resolve();});server.on('error',reject);server.once('exit',c=>{if(c)reject(new Error('server exit '+c));});});
  const url=`http://127.0.0.1:${port}`;
  const post=(body,headers={})=>fetch(url+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    await launch();let p=await (await fetch(url+'/api/project')).json();assert.equal(p.revision,0);
    assert.equal((await post({commands:[]})).status,428);
    const cmd={commands:[{op:'object.update',id:'desk_1',patch:{height:82}}],expectedRevision:0};
    const dry=await (await post({...cmd,dryRun:true})).json();assert.equal(dry.scene.furniture.find(f=>f.id==='desk_1').height,82);assert.equal((await (await fetch(url+'/api/project')).json()).revision,0);
    assert.equal((await post(cmd,{'Origin':'https://untrusted.example'})).status,403);
    const results=await Promise.all([post(cmd),post(cmd)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await post({expectedRevision:1,commands:[{op:'scene.rename',name:'must not persist'},{op:'object.update',id:'bed_1',patch:{width:-1}}]})).status,400);
    p=await (await fetch(url+'/api/project')).json();assert.notEqual(p.scene.name,'must not persist');assert.equal(p.revision,1);
    const closed=new Promise(resolve=>server.once('exit',resolve));server.kill();await closed;await launch();
    p=await (await fetch(url+'/api/project')).json();assert.equal(p.revision,1);assert.equal(p.scene.furniture.find(f=>f.id==='desk_1').height,82);
    assert.equal((await (await fetch(url+'/api/tools')).json()).length,4);
    const measured=await (await fetch(url+'/api/measure?ax=10&ay=20&bx=40&by=60')).json();assert.equal(measured.distance,50);
    assert.equal((await fetch(url+'/api/measure?ax=NaN&ay=0&bx=10&by=10')).status,400);
    const bridge=spawn(process.execPath,['scripts/mcp-server.mjs'],{cwd:root,env:{...process.env,ROOMVIEW_URL:url},stdio:['pipe','pipe','pipe'],windowsHide:true});
    const lines=readline.createInterface({input:bridge.stdout});const waiting=new Map();let nextId=0;
    lines.on('line',line=>{const msg=JSON.parse(line);waiting.get(msg.id)?.(msg);waiting.delete(msg.id);});
    const rpc=(method,params={})=>new Promise(resolve=>{const id=++nextId;waiting.set(id,resolve);bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
    try{
      assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}})).result.protocolVersion,'2025-06-18');
      assert.equal((await rpc('tools/list')).result.tools.length,4);
      const get=await rpc('tools/call',{name:'roomview_get_project',arguments:{}});assert.equal(JSON.parse(get.result.content[0].text).revision,1);
      const check=await rpc('tools/call',{name:'roomview_apply_commands',arguments:{expectedRevision:1,dryRun:true,commands:[{op:'scene.rename',name:'MCP dry-run'}]}});assert.equal(JSON.parse(check.result.content[0].text).scene.name,'MCP dry-run');
      const bad=await rpc('tools/call',{name:'roomview_apply_commands',arguments:{expectedRevision:0,commands:[{op:'scene.rename',name:'stale'}]}});assert.equal(bad.result.isError,true);
    }finally{const closed=new Promise(resolve=>bridge.once('exit',resolve));bridge.kill();await closed;}
  }finally{if(server?.exitCode===null){const closed=new Promise(resolve=>server.once('exit',resolve));server.kill();await closed;}if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('roomview-api-'))throw new Error('Unsafe cleanup path');await rm(dir,{recursive:true,force:true});}
});
