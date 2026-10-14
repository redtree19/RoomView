import { furniturePolygon, sampleWall } from './geometry.js';
const keys=['rooms','walls','furniture','measurements'];
const find=(s,id)=>{for(const key of [...keys,'groups']){const object=(s[key]||[]).find(o=>o.id===id);if(object)return {key,object};}return null;};
export function selectionRoot(s,id){const seen=new Set();while(!seen.has(id)){seen.add(id);const parent=(s.groups||[]).find(g=>g.members.includes(id));if(!parent)break;id=parent.id;}return id;}
export function expandSelection(s,ids,linkedWalls=true){
  const leaves=new Set(),visited=new Set();
  const visit=id=>{if(visited.has(id))return;visited.add(id);const f=find(s,id);if(!f)return;if(f.key==='groups')f.object.members.forEach(visit);else leaves.add(id);};
  ids.forEach(visit);
  if(linkedWalls)for(const w of s.walls)if(leaves.has(w.roomId))leaves.add(w.id);
  return [...leaves];
}
export function selectionBounds(s,ids){
  const pts=expandSelection(s,ids).flatMap(id=>{const {key,object:o}=find(s,id);return key==='rooms'?o.points:key==='walls'?sampleWall(o):key==='furniture'?furniturePolygon(o):[o.a,o.b];});
  if(!pts.length)return {x:0,y:0,width:0,height:0,cx:0,cy:0};
  const x=Math.min(...pts.map(p=>p.x)),y=Math.min(...pts.map(p=>p.y)),width=Math.max(...pts.map(p=>p.x))-x,height=Math.max(...pts.map(p=>p.y))-y;
  return {x,y,width,height,cx:x+width/2,cy:y+height/2};
}
export function transformSelection(s,ids,{dx=0,dy=0,rotation=0,center}={}){
  for(const n of [dx,dy,rotation])if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>36000)throw new Error('组合变换必须是有限数字');
  const leaves=expandSelection(s,ids);if(s.furniture.some(f=>leaves.includes(f.id)&&f.locked))throw new Error('选区包含锁定家具，请先解锁');
  const b=selectionBounds(s,ids),origin=center||{x:b.cx,y:b.cy};
  if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y))throw new Error('旋转中心无效');
  const c=Math.cos(rotation*Math.PI/180),sin=Math.sin(rotation*Math.PI/180);
  const point=p=>({x:origin.x+(p.x-origin.x)*c-(p.y-origin.y)*sin+dx,y:origin.y+(p.x-origin.x)*sin+(p.y-origin.y)*c+dy});
  for(const id of leaves){const {key,object:o}=find(s,id);if(key==='furniture'){Object.assign(o,point(o));o.rotation=(o.rotation+rotation+360)%360;}else if(key==='rooms')o.points=o.points.map(point);else{o.a=point(o.a);o.b=point(o.b);if(o.control)o.control=point(o.control);}}
  return s;
}
export function pruneGroups(s){
  s.groups||=[];let changed=true;
  while(changed){changed=false;const valid=new Set([...keys.flatMap(k=>s[k].map(o=>o.id)),...s.groups.map(g=>g.id)]);
    for(const g of s.groups)g.members=g.members.filter(id=>valid.has(id));
    const small=s.groups.find(g=>g.members.length<2);if(small){for(const g of s.groups)g.members=g.members.flatMap(id=>id===small.id?small.members:[id]);s.groups=s.groups.filter(g=>g!==small);changed=true;}
  }
}
export function deleteSelection(s,ids){const leaves=new Set(expandSelection(s,ids));for(const k of keys)s[k]=s[k].filter(o=>!leaves.has(o.id));pruneGroups(s);}
export function duplicateSelection(s,ids,newId){
  const all=new Set(expandSelection(s,ids)),groups=new Set();
  const visit=id=>{const g=(s.groups||[]).find(g=>g.id===id);if(g&&!groups.has(id)){groups.add(id);g.members.forEach(visit);}};ids.forEach(visit);
  const map=new Map([...all,...groups].map(id=>[id,newId('copy')]));
  for(const key of keys){const copies=s[key].filter(o=>all.has(o.id)).map(o=>{
    const v=structuredClone(o);v.id=map.get(o.id);v.name=(v.name+' 副本').slice(0,120);
    if(key==='furniture')v.locked=false;
    if(v.roomId){if(map.has(v.roomId))v.roomId=map.get(v.roomId);else delete v.roomId;}
    if(v.openings)v.openings.forEach(o=>o.id=newId('opening'));return v;
  });s[key].push(...copies);}
  s.groups.push(...s.groups.filter(g=>groups.has(g.id)).map(g=>({id:map.get(g.id),name:(g.name+' 副本').slice(0,120),members:g.members.map(id=>map.get(id))})));
  const copied=ids.map(id=>map.get(id));transformSelection(s,copied,{dx:30,dy:30});return copied;
}
