export const round = (n, digits = 1) => Number(n.toFixed(digits));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function wallPoint(w, t) {
  if (!w.control) return lerp(w.a, w.b, t);
  const q = 1 - t;
  return { x: q*q*w.a.x + 2*q*t*w.control.x + t*t*w.b.x, y: q*q*w.a.y + 2*q*t*w.control.y + t*t*w.b.y };
}
export function sampleWall(w, count = 64) {
  const n = w.control ? count : 1;
  return Array.from({ length: n + 1 }, (_, i) => wallPoint(w, i / n));
}
export function wallLength(w) {
  const p = sampleWall(w);
  return p.slice(1).reduce((sum, a, i) => sum + distance(a, p[i]), 0);
}
export function wallAtDistance(w, offset) {
  const ps = sampleWall(w, 128);
  let total = 0;
  for (let i = 1; i < ps.length; i++) {
    const len = distance(ps[i-1], ps[i]);
    if (total + len >= offset || i === ps.length - 1) {
      return { ...lerp(ps[i-1], ps[i], Math.max(0, Math.min(1, (offset-total) / (len || 1)))), angle: Math.atan2(ps[i].y-ps[i-1].y, ps[i].x-ps[i-1].x) };
    }
    total += len;
  }
}
export function polygonArea(points) {
  return Math.abs(points.reduce((s, p, i) => { const q = points[(i+1)%points.length]; return s + p.x*q.y - q.x*p.y; }, 0)) / 2;
}
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if (pointSegmentDistance(p,a,b)<0.001) return true;
    if (((a.y>p.y)!==(b.y>p.y)) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export const furnitureShape=f=>f.shape||(['round','plant'].includes(f.kind)?'ellipse':'rectangle');
export function furnitureLocalPolygon(f){
  const shape=furnitureShape(f);
  if(shape==='ellipse')return Array.from({length:64},(_,i)=>({x:Math.cos(i*Math.PI/32)*f.width/2,y:Math.sin(i*Math.PI/32)*f.depth/2}));
  const points=shape==='polygon'?f.vertices:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  return points.map(p=>({x:(p.x-.5)*f.width,y:(p.y-.5)*f.depth}));
}
// Recenter edited local vertices while keeping their world positions unchanged.
export function furniturePolygonPatch(f,points){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,depth=Math.max(...ys)-top;
  if(!simplePolygon(points)||width<1||depth<1)throw new Error('家具轮廓不能自交、退化或含重复相邻点');
  const cx=left+width/2,cy=top+depth/2,t=(f.rotation||0)*Math.PI/180;
  return {shape:'polygon',x:(f.x||0)+cx*Math.cos(t)-cy*Math.sin(t),y:(f.y||0)+cx*Math.sin(t)+cy*Math.cos(t),width,depth,vertices:points.map(p=>({x:(p.x-left)/width,y:(p.y-top)/depth}))};
}
export function furniturePolygon(f) {
  const t=f.rotation*Math.PI/180, c=Math.cos(t),s=Math.sin(t);
  return furnitureLocalPolygon(f).map(p=>({x:f.x+p.x*c-p.y*s,y:f.y+p.x*s+p.y*c}));
}
export function polygonsOverlap(a,b) {
  for(const axis of ['x','y'])if(Math.max(...a.map(p=>p[axis]))<=Math.min(...b.map(p=>p[axis]))+1e-6||Math.max(...b.map(p=>p[axis]))<=Math.min(...a.map(p=>p[axis]))+1e-6)return false;
  if(a.some((p,i)=>b.some((q,j)=>segmentsIntersect(p,a[(i+1)%a.length],q,b[(j+1)%b.length]))))return true;
  const inside=(p,poly)=>{
    let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];if(pointSegmentDistance(p,a,b)<=1e-6)return false;
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
    }return hit;
  };
  for(const [p,q] of [[a,b],[b,a]]){
    if(p.some(v=>inside(v,q)))return true;
    const sign=Math.sign(p.reduce((s,v,i)=>{const w=p[(i+1)%p.length];return s+v.x*w.y-w.x*v.y;},0));
    for(let i=0;i<p.length;i++){
      const v=p[i],w=p[(i+1)%p.length],len=distance(v,w)||1;
      const probe={x:(v.x+w.x)/2-sign*(w.y-v.y)/len*1e-4,y:(v.y+w.y)/2+sign*(w.x-v.x)/len*1e-4};
      if(inside(probe,p)&&inside(probe,q))return true;
    }
  }
  return false;
}
export function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
  const t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;
  return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}
export function segmentsIntersect(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),z=cross(c,d,b);
  return u*v < -1e-8 && w*z < -1e-8;
}
export function simplePolygon(p) {
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    if(j===i+1||(i===0&&j===p.length-1))continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
    if(segmentsIntersect(a,b,c,d)||pointSegmentDistance(a,c,d)<1e-6||pointSegmentDistance(b,c,d)<1e-6||pointSegmentDistance(c,a,b)<1e-6||pointSegmentDistance(d,a,b)<1e-6)return false;
  }
  return polygonArea(p)>1 && p.every((a,i)=>distance(a,p[(i+1)%p.length])>=1);
}
function contained(poly,room) {
  return poly.every(p=>pointInPolygon(p,room)) && !poly.some((p,i)=>room.some((q,j)=>segmentsIntersect(p,poly[(i+1)%poly.length],q,room[(j+1)%room.length])));
}
export function polygonDistance(a,b) {
  if(polygonsOverlap(a,b))return 0;
  let d=Infinity;
  for(const [p,q] of [[a,b],[b,a]]) for(const v of p)for(let i=0;i<q.length;i++)d=Math.min(d,pointSegmentDistance(v,q[i],q[(i+1)%q.length]));
  return d;
}
export function wallStrip(a,b,thickness) {
  const len=distance(a,b)||1,nx=-(b.y-a.y)/len*thickness/2,ny=(b.x-a.x)/len*thickness/2;
  return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
}
export function sceneBounds(scene) {
  const ps=[...scene.rooms.flatMap(r=>r.points),...scene.walls.flatMap(w=>sampleWall(w)),...scene.furniture.flatMap(furniturePolygon),...scene.measurements.flatMap(m=>[m.a,m.b])];
  if(!ps.length)return {x:-50,y:-50,width:700,height:550};
  const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(100,Math.max(...xs)-x),height:Math.max(100,Math.max(...ys)-y)};
}
export function analyze(scene) {
  const warnings=[],objects={};
  for(let i=0;i<scene.furniture.length;i++) {
    const f=scene.furniture[i],p=furniturePolygon(f),rooms=scene.rooms.filter(r=>contained(p,r.points));
    if(scene.rooms.length&&!rooms.length)warnings.push({kind:'outside',ids:[f.id],message:`${f.name} 超出房间边界`});
    if(rooms.length&&rooms.every(r=>f.elevation+f.height>r.height))warnings.push({kind:'height',ids:[f.id],message:`${f.name} 高于所在房间层高`});
    let nearestWall=Infinity;
    for(const w of scene.walls) {
      const len=wallLength(w),cuts=[0,len,...(w.openings||[]).flatMap(o=>[o.offset,o.offset+o.width])];
      if(w.control)for(let k=1;k<64;k++)cuts.push(len*k/64);
      cuts.sort((a,b)=>a-b);
      for(let k=1;k<cuts.length;k++){
        if(cuts[k]-cuts[k-1]<0.001)continue;
        const mid=(cuts[k-1]+cuts[k])/2;
        const opening=w.openings?.find(o=>mid>o.offset&&mid<o.offset+o.width&&f.elevation>=o.sill&&f.elevation+f.height<=o.sill+o.height);
        const strip=wallStrip(wallAtDistance(w,cuts[k-1]),wallAtDistance(w,cuts[k]),w.thickness);
        if(!opening)nearestWall=Math.min(nearestWall,polygonDistance(p,strip));
        if(!opening&&f.elevation<w.height&&polygonsOverlap(p,strip)) {
          if(!warnings.some(v=>v.kind==='wall'&&v.ids[0]===f.id&&v.ids[1]===w.id))warnings.push({kind:'wall',ids:[f.id,w.id],message:`${f.name} 与 ${w.name} 相交`});
        }
      }
    }
    for(let j=i+1;j<scene.furniture.length;j++) {
      const g=scene.furniture[j];
      if(f.kind==='rug'||g.kind==='rug')continue;
      if(f.elevation+f.height<=g.elevation||g.elevation+g.height<=f.elevation)continue;
      if(polygonsOverlap(p,furniturePolygon(g)))warnings.push({kind:'overlap',ids:[f.id,g.id],message:`${f.name} 与 ${g.name} 重叠`});
    }
    objects[f.id]={roomIds:rooms.map(r=>r.id),nearestWallCm:Number.isFinite(nearestWall)?round(nearestWall):null};
  }
  return {unit:'cm',areaM2:round(scene.rooms.reduce((s,r)=>s+polygonArea(r.points),0)/10000,2),warnings,objects,wallLengths:Object.fromEntries(scene.walls.map(w=>[w.id,round(wallLength(w))]))};
}
