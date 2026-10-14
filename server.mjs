import http from 'node:http';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommands, demoScene, validateScene, measurePoints } from './src/core/model.js';
import { analyze } from './src/core/geometry.js';
import { commandSchema, toolsDefinition } from './src/core/schema.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4317),host='127.0.0.1';
const dataDir=process.env.ROOMVIEW_DATA_DIR||path.join(root,'data');
const projectFile=path.join(dataDir,'project.json');
await mkdir(dataDir,{recursive:true});
let state={revision:0,scene:demoScene()},loadError=null;
try{const saved=JSON.parse(await readFile(projectFile,'utf8'));state={revision:saved.revision||0,scene:validateScene(saved.scene)};}catch(e){if(e.code!=='ENOENT'){loadError='project.json 无法读取，请先备份并修复该文件';console.error(loadError);}else await writeFile(projectFile,JSON.stringify(state,null,2));}
let queue=Promise.resolve();
async function save(scene){
  if(loadError)throw new Error(loadError);
  const next={revision:state.revision+1,scene};
  await writeFile(projectFile+'.tmp',JSON.stringify(next,null,2));await rename(projectFile+'.tmp',projectFile);state=next;return state;
}
const dev=process.argv.includes('--dev');
const vite=dev?await (await import('vite')).createServer({root,server:{middlewareMode:true,host},appType:'spa'}):null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
function json(res,status,value){res.writeHead(status,{'Content-Type':mime['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>2_000_000)throw new Error('请求不能超过 2 MB');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function safeRequest(req){
  const allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  if(!allowed.has(req.headers.host))return false;
  if(req.headers.origin){try{if(!allowed.has(new URL(req.headers.origin).host))return false;}catch{return false;}}
  return true;
}
const server=http.createServer(async(req,res)=>{
  if(!safeRequest(req))return json(res,403,{error:'仅允许本地同源访问'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname.startsWith('/api/')){
    try{
      if(req.method==='GET'){
        if(url.pathname==='/api/project')return json(res,200,{...state,storageError:loadError});
        if(url.pathname==='/api/analysis')return json(res,200,{revision:state.revision,...analyze(state.scene)});
        if(url.pathname==='/api/measure'){const values=['ax','ay','bx','by'].map(k=>{if(!url.searchParams.has(k)||url.searchParams.get(k).trim()==='')throw new Error('需要 ax、ay、bx、by 四个坐标');return Number(url.searchParams.get(k));});return json(res,200,measurePoints({x:values[0],y:values[1]},{x:values[2],y:values[3]}));}
        if(url.pathname==='/api/schema')return json(res,200,{title:'RoomView Commands',unit:'cm',coordinates:'x 向右，y 平面向下；家具位置为中心；rotation 顺时针；elevation 离地高度',commandSchema});
        if(url.pathname==='/api/tools')return json(res,200,toolsDefinition);
      }
      if((req.method==='POST'&&url.pathname==='/api/commands')||(req.method==='PUT'&&url.pathname==='/api/project')){
        if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'需要 Content-Type: application/json'});
        const data=await body(req);
        const job=queue.then(async()=>{
          if(!Number.isInteger(data.expectedRevision))return json(res,428,{error:'必须提供 expectedRevision；请先 GET /api/project',revision:state.revision});
          if(data.expectedRevision!==state.revision)return json(res,409,{error:'布局已更新，请读取最新布局后重试',revision:state.revision});
          const result=req.method==='PUT'?{scene:validateScene(data.scene),results:[]}:applyCommands(state.scene,data.commands);
          if(data.dryRun)return json(res,200,{revision:state.revision,dryRun:true,...result,analysis:analyze(result.scene)});
          const next=await save(result.scene);json(res,200,{...next,results:result.results});
        });
        queue=job.catch(()=>{});await job;return;
      }
      return json(res,404,{error:'没有此 API 路由'});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if(vite)return vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
  try{
    const target=path.resolve(root,'dist','.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(path.join(root,'dist')+path.sep))throw new Error('invalid path');
    const content=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(content);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件未找到。请先运行 npm run build。');}
});
server.listen(port,host,()=>console.log(`RoomView ready: http://${host}:${port}\nAI API: http://${host}:${port}/api/tools\nProject: ${projectFile}`));
server.on('error',e=>{console.error(e.message);process.exit(1);});
async function close(){await vite?.close();server.close(()=>process.exit(0));}
process.on('SIGINT',close);process.on('SIGTERM',close);
