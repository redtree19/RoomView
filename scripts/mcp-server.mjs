// Small stdio bridge for MCP 2025-06-18. All writes go through the revision-checked HTTP API.
import readline from 'node:readline';
import { toolsDefinition } from '../src/core/schema.js';
import { callTool } from './client.mjs';
const versions=['2024-11-05','2025-03-26','2025-06-18'];
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let initialized=false;
let queue=Promise.resolve();
async function handle(line){
  let msg;try{msg=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
  if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string'){send({jsonrpc:'2.0',id:msg?.id??null,error:{code:-32600,message:'Invalid Request'}});return;}
  if(msg.id===undefined)return;
  const respond=result=>send({jsonrpc:'2.0',id:msg.id,result});
  const error=(code,message)=>send({jsonrpc:'2.0',id:msg.id,error:{code,message}});
  if(msg.method==='initialize'){initialized=true;return respond({protocolVersion:versions.includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'roomview',version:'0.1.0'},instructions:'RoomView 使用厘米。先读取项目和 revision，再用 expectedRevision 提交 commands。遇到 409 应重新读取布局，不要盲目覆盖。'});}
  if(msg.method==='ping')return respond({});
  if(!initialized)return error(-32002,'Initialize first');
  if(msg.method==='tools/list')return respond({tools:toolsDefinition.map(({function:f})=>({name:f.name,description:f.description,inputSchema:f.parameters,annotations:{readOnlyHint:f.name!=='roomview_apply_commands',destructiveHint:f.name==='roomview_apply_commands',openWorldHint:false}}))});
  if(msg.method==='tools/call'){
    if(!toolsDefinition.some(t=>t.function.name===msg.params?.name))return error(-32602,'Unknown tool');
    try{const result=await callTool(msg.params.name,msg.params.arguments||{});return respond({content:[{type:'text',text:JSON.stringify(result)}]});}catch(e){return respond({isError:true,content:[{type:'text',text:e.message}]});}
  }
  return error(-32601,'Method not found');
}
input.on('line',line=>{queue=queue.then(()=>handle(line)).catch(e=>{process.stderr.write(e.message+'\n');});});
