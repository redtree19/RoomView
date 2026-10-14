const base=process.env.ROOMVIEW_URL||'http://127.0.0.1:4317';
export async function request(route,body){
  const options={signal:AbortSignal.timeout(15000)};
  if(body){options.method='POST';options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body);}
  const res=await fetch(new URL(route,base),options),data=await res.json();if(!res.ok)throw new Error(`${res.status}: ${data.error}`);return data;
}
export async function callTool(name,args={}){
  switch(name){
    case 'roomview_get_project':return request('/api/project');
    case 'roomview_analyze':return request('/api/analysis');
    case 'roomview_apply_commands':return request('/api/commands',args);
    case 'roomview_measure':return request('/api/measure?'+new URLSearchParams({ax:args.a?.x,ay:args.a?.y,bx:args.b?.x,by:args.b?.y}));
    default:throw new Error('Unknown tool: '+name);
  }
}
