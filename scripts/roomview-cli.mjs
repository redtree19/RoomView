import { readFile } from 'node:fs/promises';
import { request } from './client.mjs';
const [command,arg,arg2,arg3,arg4]=process.argv.slice(2);
try{
  let result;
  if(!command||command==='help'){
    console.log('RoomView CLI\n  npm run ai -- get\n  npm run ai -- analyze\n  npm run ai -- schema\n  npm run ai -- measure X1 Y1 X2 Y2\n  npm run ai -- apply commands.json\n  npm run ai -- dry-run commands.json\n\n先启动 npm run dev 或 npm start。文件格式 {expectedRevision, commands:[...]}；可以不提供 expectedRevision，CLI 会先读取当前版本。');process.exit(0);
  }else if(command==='get')result=await request('/api/project');
  else if(command==='analyze')result=await request('/api/analysis');
  else if(command==='schema')result=await request('/api/schema');
  else if(command==='measure')result=await request('/api/measure?'+new URLSearchParams({ax:arg,ay:arg2,bx:arg3,by:arg4}));
  else if(command==='apply'||command==='dry-run'){
    const raw=JSON.parse(await readFile(arg,'utf8'));
    const body=Array.isArray(raw)?{commands:raw}:raw;
    if(body.expectedRevision===undefined)body.expectedRevision=(await request('/api/project')).revision;
    result=await request('/api/commands',{...body,dryRun:command==='dry-run'});
  }else throw new Error('未知命令：'+command);
  console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
