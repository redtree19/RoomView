import { distance, simplePolygon, wallLength, round, polygonDistance, furniturePolygon, furnitureLocalPolygon } from './geometry.js';
import { selectionRoot, transformSelection, deleteSelection, duplicateSelection, pruneGroups } from './groups.js';
export const clone = value => structuredClone(value);
export const uid = (prefix='obj') => `${prefix}_${globalThis.crypto.randomUUID().slice(0,8)}`;
export const CATEGORIES=['box','bed','sofa','table','chair','cabinet','rug','plant','round'];
export const presets=[
  {kind:'bed',name:'双人床',width:160,depth:210,height:55,color:'#b7c6bd',symbol:'▤'},
  {kind:'sofa',name:'双人沙发',width:180,depth:85,height:80,color:'#d1ac8c',symbol:'▰'},
  {kind:'table',name:'书桌',width:140,depth:70,height:75,color:'#c6b48f',symbol:'▱'},
  {kind:'chair',name:'椅子',width:50,depth:50,height:85,color:'#92b2ae',symbol:'▥'},
  {kind:'cabinet',name:'衣柜',width:160,depth:60,height:220,color:'#a7b4c6',symbol:'▥'},
  {kind:'round',name:'圆桌',width:90,depth:90,height:75,color:'#c4b398',symbol:'○'},
  {kind:'rug',name:'地毯',width:200,depth:140,height:1,color:'#d8cbb6',symbol:'▧'},
  {kind:'plant',name:'绿植',width:40,depth:40,height:110,color:'#86a294',symbol:'♧'},
  {kind:'box',name:'自定义家具',width:80,depth:60,height:80,color:'#b9aec9',symbol:'□'},
  {kind:'box',shape:'ellipse',name:'圆形家具',width:80,depth:80,height:60,color:'#a5bdc8',symbol:'○'},
  {kind:'box',shape:'polygon',vertices:[{x:0,y:0},{x:1,y:0},{x:1,y:.4},{x:.4,y:.4},{x:.4,y:1},{x:0,y:1}],name:'L 形家具',width:160,depth:120,height:75,color:'#b9aec9',symbol:'⌑'},
];
export function emptyScene(){return {version:1,name:'我的空间',unit:'cm',rooms:[],walls:[],furniture:[],measurements:[],groups:[]};}
export function rectangleRoom({id=uid('room'),name='房间',x=0,y=0,width=500,depth=400,height=280,color='#e7e7dc',thickness=12,withWalls=true}) {
  num(x,'房间 X');num(y,'房间 Y');num(width,'房间宽度',20,10000);num(depth,'房间深度',20,10000);
  const points=[{x,y},{x:x+width,y},{x:x+width,y:y+depth},{x,y:y+depth}];
  return {room:{id,name,points,height,color},walls:withWalls?points.map((a,i)=>({id:uid('wall'),name:`${name} · 墙 ${i+1}`,a,b:points[(i+1)%4],height,thickness,roomId:id,openings:[]})):[]};
}
export function demoScene(){
  const s=emptyScene();s.name='一室之间 · 布局方案';
  const {room,walls}=rectangleRoom({id:'room_main',name:'起居室',width:620,depth:480});
  walls.forEach((w,i)=>w.id=`wall_${i+1}`);
  walls[0].openings=[{id:'window_1',type:'window',offset:190,width:220,height:140,sill:90}];
  walls[3].openings=[{id:'door_1',type:'door',offset:45,width:90,height:210,sill:0}];
  s.rooms=[room];s.walls=walls;
  s.furniture=[
    {...presets[0],id:'bed_1',x:490,y:125,width:160,depth:210,rotation:0,elevation:0,locked:false},
    {...presets[1],id:'sofa_1',x:145,y:420,rotation:0,elevation:0,locked:false},
    {...presets[2],id:'desk_1',x:265,y:52,rotation:0,elevation:0,locked:false},
    {...presets[3],id:'chair_1',x:265,y:125,rotation:0,elevation:0,locked:false},
    {...presets[4],id:'cabinet_1',x:510,y:435,rotation:0,elevation:0,locked:false},
    {...presets[5],id:'table_1',x:155,y:300,width:70,depth:70,height:45,rotation:0,elevation:0,locked:false},
    {...presets[7],id:'plant_1',x:52,y:48,rotation:0,elevation:0,locked:false},
  ].map(({symbol,...f})=>f);
  s.measurements=[{id:'measure_1',name:'活动空间',a:{x:330,y:240},b:{x:410,y:240}}];
  return s;
}
const fail = message => { throw new Error(message); };
function num(n,label,min=-10000,max=10000){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail(`${label} 必须是 ${min}～${max} 之间的数字`);return n;}
function str(s,label){if(typeof s!=='string'||s.length>120)fail(`${label} 必须为不超过 120 字的文本`);return s;}
function point(p,label){if(!p||typeof p!=='object')fail(`${label} 缺少坐标`);return {x:num(p.x,`${label}.x`),y:num(p.y,`${label}.y`)};}
function color(c){if(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))fail('颜色必须是 #RRGGBB');return c;}
export function validateScene(input){
  if(!input||input.version!==1||input.unit!=='cm')fail('需要 version:1、unit:"cm" 的 RoomView 场景');
  const s={version:1,name:str(input.name,'场景名称'),unit:'cm'},ids=new Set();
  const identity=(o)=>{if(!o||typeof o!=='object'||typeof o.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(o.id)||ids.has(o.id))fail('对象 ID 必须唯一，只允许字母、数字、_ 和 -');ids.add(o.id);return {id:o.id,name:str(o.name,'名称')};};
  for(const [key,max] of [['rooms',40],['walls',300],['furniture',300],['measurements',200]]){
    if(!Array.isArray(input[key])||input[key].length>max)fail(`${key} 必须为数组，最多 ${max} 个`);
  }
  s.rooms=input.rooms.map(r=>{
    if(!Array.isArray(r.points)||r.points.length<3||r.points.length>80)fail('房间需要 3～80 个顶点');
    const p=r.points.map(a=>point(a,'房间顶点'));if(!simplePolygon(p))fail('房间轮廓不能自交、退化或含重复相邻点');
    return {...identity(r),points:p,height:num(r.height,'层高',10,2000),color:color(r.color)};
  });
  s.walls=input.walls.map(w=>{
    const v={...identity(w),a:point(w.a,'墙起点'),b:point(w.b,'墙终点'),height:num(w.height,'墙高',1,2000),thickness:num(w.thickness,'墙厚',1,100),openings:[]};
    if(distance(v.a,v.b)<1)fail('墙起终点至少相距 1 cm');
    if(w.control)v.control=point(w.control,'曲线控制点');
    if(w.roomId){if(!s.rooms.some(r=>r.id===w.roomId))fail('墙的 roomId 不存在');v.roomId=w.roomId;}
    if(w.openings!==undefined&&!Array.isArray(w.openings))fail('openings 必须是数组');
    if((w.openings?.length||0)>20)fail('一面墙最多 20 个开口');
    v.openings=(w.openings||[]).map(o=>{
      if(!['door','window'].includes(o.type))fail('开口类型为 door 或 window');
      const id=identity({...o,name:o.type}).id;
      const q={id,type:o.type,offset:num(o.offset,'开口沿墙偏移',0),width:num(o.width,'开口宽度',1,2000),height:num(o.height,'开口高度',1,2000),sill:num(o.sill,'开口底高',0,2000)};
      if(q.offset+q.width>wallLength(v)+0.01||q.sill+q.height>v.height+0.01)fail('门窗必须完整位于墙体内');return q;
    });
    for(let i=0;i<v.openings.length;i++)for(let j=i+1;j<v.openings.length;j++){const a=v.openings[i],b=v.openings[j];if(a.offset<b.offset+b.width&&b.offset<a.offset+a.width)fail('同一面墙的门窗不能水平重叠');}
    return v;
  });
  s.furniture=input.furniture.map(f=>{
    if(!CATEGORIES.includes(f.kind))fail('未知家具 kind');
    const v={...identity(f),kind:f.kind,x:num(f.x,'x'),y:num(f.y,'y'),width:num(f.width,'宽度',1,3000),depth:num(f.depth,'深度',1,3000),height:num(f.height,'高度',0.1,2000),rotation:((num(f.rotation,'旋转角度',-36000,36000)%360)+360)%360,elevation:num(f.elevation,'离地高度',0,2000),color:color(f.color),locked:Boolean(f.locked)};
    if(f.shape!=null){if(!['rectangle','ellipse','polygon'].includes(f.shape))fail('家具 shape 必须为 rectangle、ellipse 或 polygon');v.shape=f.shape;}
    if(v.shape==='polygon'){
      if(!Array.isArray(f.vertices)||f.vertices.length<3||f.vertices.length>80)fail('家具轮廓需要 3～80 个顶点');
      v.vertices=f.vertices.map(p=>({x:num(p?.x,'顶点 x',0,1),y:num(p?.y,'顶点 y',0,1)}));
      for(const axis of ['x','y'])if(Math.abs(Math.min(...v.vertices.map(p=>p[axis])))>1e-6||Math.abs(Math.max(...v.vertices.map(p=>p[axis]))-1)>1e-6)fail('顶点须覆盖 0～1 的完整宽深范围');
      if(!simplePolygon(furnitureLocalPolygon(v)))fail('家具轮廓不能自交、退化或含重复相邻点');
    }
    return v;
  });
  s.measurements=input.measurements.map(m=>({...identity(m),a:point(m.a,'测量起点'),b:point(m.b,'测量终点')}));
  if(input.groups!==undefined&&(!Array.isArray(input.groups)||input.groups.length>300))fail('groups 必须是数组，最多 300 个');
  s.groups=(input.groups||[]).map(g=>{if(!Array.isArray(g.members)||g.members.length<2||g.members.length>840||new Set(g.members).size!==g.members.length)fail('组合至少包含两个不同对象');return {...identity(g),members:[...g.members]};});
  const objects=new Set(['rooms','walls','furniture','measurements','groups'].flatMap(k=>s[k].map(o=>o.id))),owners=new Map();
  for(const g of s.groups)for(const id of g.members){if(!objects.has(id))fail('组合引用了不存在的对象');if(owners.has(id))fail('一个对象不能属于多个组合');owners.set(id,g.id);}
  for(const g of s.groups){const seen=new Set();let id=g.id;while(owners.has(id)){if(seen.has(id))fail('组合不能循环引用');seen.add(id);id=owners.get(id);}}
  return s;
}
export function locate(s,id){for(const key of ['rooms','walls','furniture','measurements','groups']){const object=(s[key]||[]).find(o=>o.id===id);if(object)return {key,object};}return null;}
export function applyCommands(scene,commands){
  if(!Array.isArray(commands)||commands.length<1||commands.length>100)fail('commands 必须包含 1～100 条命令');
  let s=validateScene(scene);const results=[];
  for(const c of commands){
    if(!c||typeof c!=='object')fail('命令必须是对象');
    if(c.op==='scene.load'){s=validateScene(c.scene);results.push({op:c.op});continue;}
    if(c.op==='scene.rename'){s.name=str(c.name,'场景名称');results.push({op:c.op});continue;}
    if(c.op==='group.ungroup'){
      const g=s.groups.find(g=>g.id===c.id);if(!g)fail('组合不存在');for(const p of s.groups)p.members=p.members.flatMap(id=>id===g.id?g.members:[id]);s.groups=s.groups.filter(p=>p.id!==g.id);results.push({ids:g.members});continue;
    }
    if(c.op==='group.create'||c.op.startsWith('selection.')){
      if(!Array.isArray(c.ids)||!c.ids.length||c.ids.some(id=>!locate(s,id)))fail('ids 需要有效对象 ID');
      const ids=[...new Set(c.ids.map(id=>selectionRoot(s,id)))];
      if(c.op==='group.create'){if(ids.length<2)fail('至少选择两个对象或组合');const g={id:c.id||uid('group'),name:c.name||'组合',members:ids};s.groups.push(g);results.push({id:g.id});}
      else if(c.op==='selection.transform'){transformSelection(s,ids,c);results.push({ids});}
      else if(c.op==='selection.delete'){deleteSelection(s,ids);results.push({ids:[]});}
      else if(c.op==='selection.duplicate')results.push({ids:duplicateSelection(s,ids,uid)});
      else fail(`未知命令 ${c.op}`);
      continue;
    }
    if(c.op==='room.rectangle'){
      const data=c.data||{};const {room,walls}=rectangleRoom(data);s.rooms.push(room);s.walls.push(...walls);results.push({id:room.id,wallIds:walls.map(w=>w.id)});continue;
    }
    const groups={'room.add':'rooms','wall.add':'walls','furniture.add':'furniture','measurement.add':'measurements'};
    if(groups[c.op]){
      const defaults=c.op==='furniture.add'?{...presets[8],x:100,y:100,rotation:0,elevation:0,locked:false}:c.op==='wall.add'?{name:'墙体',height:280,thickness:12,openings:[]}:c.op==='room.add'?{name:'房间',height:280,color:'#e7e7dc'}:{name:'测量'};
      const object={...defaults,...c.data,id:c.data?.id||uid(c.op.split('.')[0])};s[groups[c.op]].push(object);results.push({id:object.id});continue;
    }
    const found=locate(s,c.id);if(!found)fail(`对象 ${c.id} 不存在`);
    if(c.op==='object.update'){
      if(!c.patch||typeof c.patch!=='object'||Array.isArray(c.patch))fail('patch 必须是对象');
      if('id' in c.patch)fail('不能修改对象 ID');
      Object.assign(found.object,c.patch);results.push({id:c.id});
    }else if(c.op==='object.delete'){
      deleteSelection(s,[c.id]);results.push({id:c.id});
    }else if(c.op==='object.duplicate'){
      if(found.key!=='furniture')fail('复制命令仅适用于家具');const f={...found.object,id:uid('furniture'),name:found.object.name+' 副本',x:found.object.x+30,y:found.object.y+30,locked:false};s.furniture.push(f);results.push({id:f.id});
    }else fail(`未知命令 ${c.op}`);
  }
  return {scene:validateScene(s),results};
}
export function measureBetween(scene,aId,bId){
  const a=scene.furniture.find(f=>f.id===aId),b=scene.furniture.find(f=>f.id===bId);
  if(!a||!b)fail('测距需要两个家具 ID');
  return {unit:'cm',edgeDistance:round(polygonDistance(furniturePolygon(a),furniturePolygon(b))),centerDistance:round(distance(a,b))};
}
export function measurePoints(a,b){const p=point(a,'测量起点'),q=point(b,'测量终点');return {unit:'cm',a:p,b:q,distance:round(distance(p,q)),dx:round(q.x-p.x),dy:round(q.y-p.y)};}
