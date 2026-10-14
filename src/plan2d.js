import { clone, uid, rectangleRoom } from './core/model.js';
import { distance, round, polygonArea, wallLength, wallPoint, wallAtDistance, sceneBounds, furniturePolygon, furnitureLocalPolygon, furnitureShape, furniturePolygonPatch } from './core/geometry.js';
import { selectionRoot, expandSelection, selectionBounds, transformSelection } from './core/groups.js';
export const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class Plan2D {
  constructor(svg,callbacks){
    this.svg=svg;this.cb=callbacks;this.tool='select';this.points=[];this.cursor=null;this.snap=true;this.grid=10;this.dimensions=true;this.vb={x:-70,y:-60,width:800,height:650};this.space=false;
    svg.addEventListener('pointerdown',e=>this.down(e));svg.addEventListener('pointermove',e=>this.move(e));svg.addEventListener('pointerup',e=>this.up(e));svg.addEventListener('pointercancel',()=>{if(this.drag?.before)this.cb.preview(this.drag.before);this.drag=null;this.render();});
    svg.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY>0?1.12:1/1.12,this.point(e,false));},{passive:false});
    svg.addEventListener('dblclick',e=>{if(['polygon','furniture'].includes(this.tool)){e.preventDefault();this.finishPolygon();}});
    svg.addEventListener('contextmenu',e=>e.preventDefault());
    window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Space'){this.space=true;e.preventDefault();}if(e.key==='Escape')this.cancel();if(e.key==='Enter'&&['polygon','furniture'].includes(this.tool))this.finishPolygon();});
    window.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false;});
    new ResizeObserver(()=>{if(svg.clientWidth&&svg.clientHeight)this.fit();}).observe(svg);
  }
  point(e,snap=true){if(snap&&this.tool==='measure')return this.measurePoint(e);const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(this.svg.getScreenCTM().inverse());const g=snap&&this.snap&&!e.altKey?this.grid:0;return {x:g?Math.round(p.x/g)*g:round(p.x),y:g?Math.round(p.y/g)*g:round(p.y)};}
  measurePoint(e){
    const p=this.point(e,false);this.pointSnap=false;if(!this.snap||e.altKey)return p;
    const s=this.cb.getScene(),candidates=[...s.rooms.flatMap(r=>r.points),...s.walls.flatMap(w=>[w.a,w.b]),...s.furniture.flatMap(furniturePolygon),...s.measurements.flatMap(m=>[m.a,m.b])];
    let best=null,limit=10/(this.svg.getScreenCTM()?.a||1);for(const v of candidates){const d=distance(p,v);if(d<limit){best=v;limit=d;}}
    if(best){this.pointSnap=true;return {...best};}return p;
  }
  setTool(tool){this.tool=tool;this.points=[];this.cursor=null;this.render();}
  cancel(){this.points=[];this.cursor=null;if(this.drag?.before)this.cb.preview(this.drag.before);this.drag=null;this.cb.setTool('select');this.render();}
  fit(){const b=sceneBounds(this.cb.getScene()),r=this.svg.getBoundingClientRect(),ratio=(r.width||800)/(r.height||650),w=b.width+150,h=b.height+150;this.vb={x:b.x-75,y:b.y-75,width:Math.max(w,h*ratio),height:Math.max(h,w/ratio)};this.vb.x=b.x+b.width/2-this.vb.width/2;this.vb.y=b.y+b.height/2-this.vb.height/2;this.render();}
  zoom(factor,p){const {x,y,width,height}=this.vb;if(width*factor<100||width*factor>20000)return;p=p||{x:x+width/2,y:y+height/2};this.vb={x:p.x-(p.x-x)*factor,y:p.y-(p.y-y)*factor,width:width*factor,height:height*factor};this.render();}
  down(e){
    if(e.button===2)return;const p=this.point(e);const raw=this.point(e,false);
    if(e.button===1||this.space||this.tool==='pan'){this.drag={type:'pan',p:raw,vb:{...this.vb},client:{x:e.clientX,y:e.clientY}};this.svg.setPointerCapture(e.pointerId);return;}
    if(this.tool==='room'){this.drag={type:'rectangle',p};this.cursor=p;this.svg.setPointerCapture(e.pointerId);return;}
    if(['wall','curve','measure','polygon','furniture'].includes(this.tool)){
      const polygonTool=['polygon','furniture'].includes(this.tool);
      if(polygonTool&&this.points.length>=3&&distance(p,this.points[0])<15){this.finishPolygon();return;}
      if(this.points.length&&distance(p,this.points.at(-1))<0.5)return;
      this.points.push(p);const n=this.tool==='curve'?3:2;
      if(!polygonTool&&this.points.length===n){
        if(distance(this.points[0],this.points[1])<1){this.points=[];return;}
        const data={a:this.points[0],b:this.points[1]};
        if(this.tool==='curve')data.control=this.points[2];
        this.cb.execute([{op:this.tool==='measure'?'measurement.add':'wall.add',data:{...data,name:this.tool==='measure'?'尺寸标注':this.tool==='curve'?'曲线墙':'直墙'}}]);this.points=[];
      }this.render();return;
    }
    const target=e.target.closest('[data-id]'),handle=e.target.closest('[data-handle]');
    if(!target){this.cb.select(null,{toggle:e.ctrlKey||e.metaKey});return;}
    const id=target.dataset.id,toggle=e.ctrlKey||e.metaKey;this.cb.select(id,{toggle,preserve:!toggle});const scene=this.cb.getScene(),ids=[...this.cb.getSelection()];
    if(toggle)return;
    if(scene.furniture.some(f=>expandSelection(scene,ids).includes(f.id)&&f.locked)){this.cb.toast('选区含锁定家具，请先解锁');return;}
    this.drag={type:'object',id,p,ids,bounds:selectionBounds(scene,ids),before:clone(scene),handle:handle?.dataset.handle,moved:false};this.svg.setPointerCapture(e.pointerId);
  }
  move(e){
    const p=this.point(e);this.cursor=p;this.cb.coordinates(p);
    if(this.drag?.type==='pan'){
      const r=this.svg.getBoundingClientRect(),d=this.drag;this.vb={...d.vb,x:d.vb.x-(e.clientX-d.client.x)*d.vb.width/r.width,y:d.vb.y-(e.clientY-d.client.y)*d.vb.height/r.height};this.render();return;
    }
    if(this.drag?.type==='rectangle'){this.render();return;}
    if(this.drag?.type==='object'){
      const d=this.drag,dx=p.x-d.p.x,dy=p.y-d.p.y;if(!dx&&!dy&&!d.moved)return;d.moved=true;const scene=clone(d.before);
      if(!d.handle||d.handle==='selection-rotate'){
        const rotation=d.handle==='selection-rotate'?Math.atan2(p.y-d.bounds.cy,p.x-d.bounds.cx)*180/Math.PI+90:0;
        try{transformSelection(scene,d.ids,d.handle==='selection-rotate'?{rotation:e.shiftKey?rotation:Math.round(rotation/15)*15,center:{x:d.bounds.cx,y:d.bounds.cy}}:{dx,dy});this.cb.preview(scene);}catch(error){this.cb.toast(error.message);}return;
      }
      const f=scene.furniture.find(o=>o.id===d.id),w=scene.walls.find(o=>o.id===d.id),r=scene.rooms.find(o=>o.id===d.id),m=scene.measurements.find(o=>o.id===d.id);
      const shift=q=>({x:round(q.x+dx),y:round(q.y+dy)});
      if(f){if(d.handle?.startsWith('vertex-')){const ps=furnitureLocalPolygon(f),t=f.rotation*Math.PI/180;ps[+d.handle.slice(7)]={x:(p.x-f.x)*Math.cos(t)+(p.y-f.y)*Math.sin(t),y:-(p.x-f.x)*Math.sin(t)+(p.y-f.y)*Math.cos(t)};try{Object.assign(f,furniturePolygonPatch(f,ps));}catch{return;}}else if(d.handle==='rotate'){const angle=Math.atan2(p.y-f.y,p.x-f.x)*180/Math.PI+90;f.rotation=e.shiftKey?round(angle):Math.round(angle/15)*15;}else{f.x=round(f.x+dx);f.y=round(f.y+dy);}}
      if(w){if(d.handle)w[d.handle]=p;else{w.a=shift(w.a);w.b=shift(w.b);if(w.control)w.control=shift(w.control);}}
      if(m){if(d.handle)m[d.handle]=p;else{m.a=shift(m.a);m.b=shift(m.b);}}
      if(r){r.points=r.points.map(shift);for(const v of scene.walls.filter(v=>v.roomId===r.id)){v.a=shift(v.a);v.b=shift(v.b);if(v.control)v.control=shift(v.control);}}
      this.cb.preview(scene);return;
    }
    if(this.points.length||this.tool==='measure')this.render();
  }
  up(e){
    const d=this.drag;if(!d)return;this.drag=null;
    if(d.type==='rectangle'){
      const p=this.point(e),width=Math.abs(p.x-d.p.x),depth=Math.abs(p.y-d.p.y);
      if(width>=20&&depth>=20)this.cb.execute([{op:'room.rectangle',data:{name:'新房间',x:Math.min(p.x,d.p.x),y:Math.min(p.y,d.p.y),width,depth}}]);else this.cb.toast('请拖出至少 20 × 20 cm 的房间');
    }
    if(d.type==='object'&&d.moved)this.cb.commit(d.before);this.render();
  }
  finishPolygon(){
    if(this.points.length<3){this.cb.toast('至少放置 3 个顶点');return;}
    if(this.tool==='furniture'){try{const patch=furniturePolygonPatch({x:0,y:0,rotation:0},this.points);this.cb.execute([{op:'furniture.add',data:{...patch,name:'异形家具',kind:'box',height:75}}]);this.points=[];this.cb.setTool('select');}catch(error){this.cb.toast(error.message);}return;}
    const id=uid('room'),points=clone(this.points);this.points=[];
    this.cb.execute([{op:'room.add',data:{id,name:'异形房间',points}},...points.map((a,i)=>({op:'wall.add',data:{name:`轮廓墙 ${i+1}`,roomId:id,a,b:points[(i+1)%points.length]}}))]);this.cb.setTool('select');
  }
  dimension(a,b,label,cls='dimension'){
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2;return `<g class="${cls}" pointer-events="none"><path d="M${a.x},${a.y} L${b.x},${b.y}"/><circle cx="${a.x}" cy="${a.y}" r="2"/><circle cx="${b.x}" cy="${b.y}" r="2"/><text x="${x}" y="${y-6}">${escapeHtml(label)}</text></g>`;
  }
  render(){
    const s=this.cb.getScene();if(!s)return;const selected=this.cb.getSelected(),ids=this.cb.getSelection(),selectedSet=new Set(expandSelection(s,ids)),multi=ids.length>1||(s.groups||[]).some(g=>g.id===selected),analysis=this.cb.getAnalysis(),bad=new Set(analysis?.warnings.flatMap(w=>w.ids)||[]),v=this.vb;
    this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.width} ${v.height}`);this.svg.style.cursor=this.tool==='pan'?'grab':this.tool==='select'?'default':'crosshair';
    let out=`<defs><pattern id="minor-grid" width="${this.grid}" height="${this.grid}" patternUnits="userSpaceOnUse"><path d="M ${this.grid} 0 L 0 0 0 ${this.grid}" fill="none" stroke="#dfe5de" stroke-width=".45"/></pattern><pattern id="major-grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor-grid)"/><path d="M100 0 H0 V100" fill="none" stroke="#cbd6ce" stroke-width=".8"/></pattern></defs><rect x="${v.x}" y="${v.y}" width="${v.width}" height="${v.height}" fill="url(#major-grid)"/>`;
    for(const r of s.rooms){const xs=r.points.map(p=>p.x),ys=r.points.map(p=>p.y);out+=`<g data-id="${r.id}" class="room ${selectedSet.has(r.id)?'selected':''}"><polygon points="${r.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${r.color}" fill-opacity=".57" stroke="${selectedSet.has(r.id)?'#287760':'#b8c5b8'}" stroke-width="${selectedSet.has(r.id)?2:1}"/><text x="${Math.min(...xs)+22}" y="${Math.min(...ys)+28}" class="room-label">${escapeHtml(r.name)}</text><text x="${Math.min(...xs)+22}" y="${Math.min(...ys)+43}" class="room-area">${round(polygonArea(r.points)/10000,2)} m² · H ${r.height}</text></g>`;}
    for(const w of s.walls){
      const d=`M${w.a.x},${w.a.y} ${w.control?`Q${w.control.x},${w.control.y} ${w.b.x},${w.b.y}`:`L${w.b.x},${w.b.y}`}`;
      out+=`<g data-id="${w.id}" class="wall"><path d="${d}" fill="none" stroke="${selectedSet.has(w.id)?'#3d8e78':'#70877e'}" stroke-width="${w.thickness}" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(15,w.thickness)}"/>`;
      for(const o of w.openings){const a=wallAtDistance(w,o.offset),b=wallAtDistance(w,o.offset+o.width),mid=wallAtDistance(w,o.offset+o.width/2),angle=mid.angle*180/Math.PI;
        const path=w.control?Array.from({length:17},(_,i)=>{const p=wallAtDistance(w,o.offset+o.width*i/16);return `${i?'L':'M'}${p.x},${p.y}`;}).join(' '):`M${a.x},${a.y} L${b.x},${b.y}`;
        out+=`<path d="${path}" stroke="#f5f6f0" stroke-width="${w.thickness+1}"/>`;
        if(o.type==='window')out+=`<path d="${path}" stroke="#6d9cab" stroke-width="3"/><path d="${path}" stroke="#d9e8e6" stroke-width="1"/>`;
        else out+=`<g transform="translate(${a.x} ${a.y}) rotate(${angle})"><path d="M0 0 L0 ${o.width} M0 ${o.width} A${o.width} ${o.width} 0 0 0 ${o.width} 0" fill="none" stroke="#819d8c" stroke-width="1.2"/></g>`;
      }
      if(this.dimensions){const mid=wallPoint(w,.5);out+=`<text x="${mid.x}" y="${mid.y-14}" class="wall-length">${w.control?'⌒ ':''}${round(wallLength(w))} cm</text>`;}
      if(selected===w.id&&!multi){if(w.control)out+=`<path d="M${w.a.x},${w.a.y} L${w.control.x},${w.control.y} L${w.b.x},${w.b.y}" class="control-line"/>`;for(const key of ['a','b',...(w.control?['control']:[])])out+=`<circle data-handle="${key}" cx="${w[key].x}" cy="${w[key].y}" r="6" class="handle"/>`;}
      out+='</g>';
    }
    for(const f of [...s.furniture].sort((a,b)=>a.elevation-b.elevation||(a.kind==='rug'?-1:1))){
      const w=f.width,d=f.depth,c=f.color,isSelected=selectedSet.has(f.id);
      const shape=furnitureShape(f),attrs=`fill="${c}" stroke="${isSelected?'#1e7559':bad.has(f.id)?'#bc7551':'#68786f'}" stroke-width="${isSelected?2.5:1}"`;
      out+=`<g data-id="${f.id}" transform="translate(${f.x} ${f.y}) rotate(${f.rotation})" class="furniture ${isSelected?'selected':''}" style="cursor:${f.locked?'not-allowed':'move'}">`;
      out+=shape==='ellipse'?`<ellipse rx="${w/2}" ry="${d/2}" ${attrs}/>`:shape==='polygon'?`<polygon points="${furnitureLocalPolygon(f).map(p=>`${p.x},${p.y}`).join(' ')}" ${attrs}/>`:`<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" ${attrs}/>`;
      if(!f.shape&&f.kind==='bed')out+=`<rect x="${-w*.44}" y="${-d*.43}" width="${w*.88}" height="${d*.18}" rx="4" fill="#f8f6ed"/><path d="M${-w*.5},${-d*.18} H${w*.5}" stroke="#f4f4e9" stroke-width="3"/>`;
      if(!f.shape&&f.kind==='sofa')out+=`<path d="M${-w*.4},${-d*.5} V${d*.3} H${w*.4} V${-d*.5} M0,${-d*.5} V${d*.3}" fill="none" stroke="#f5e6d8" stroke-width="2"/>`;
      if(!f.shape&&f.kind==='cabinet')out+=`<path d="M0,${-d*.5} V${d*.5}" stroke="#edf0f2" stroke-width="2"/>`;
      out+=`<text class="furniture-name" text-anchor="middle" y="4" style="font-size:${Math.min(11,w/Math.max(f.name.length,3)*.8)}px">${escapeHtml(f.name)}${f.locked?' ▪':''}</text>`;
      if(d>45&&w>65)out+=`<text class="furniture-size" text-anchor="middle" y="18">${round(w)} × ${round(d)}</text>`;
      if(isSelected&&!multi){out+=`<path d="M0,${-d/2} V${-d/2-24}" stroke="#287760" stroke-width="1.5"/><circle data-handle="rotate" cx="0" cy="${-d/2-24}" r="7" class="handle"/>`;}
      if(isSelected&&!multi&&shape==='polygon')furnitureLocalPolygon(f).forEach((p,i)=>{out+=`<circle data-handle="vertex-${i}" cx="${p.x}" cy="${p.y}" r="5" class="handle"/>`;});
      out+='</g>';
      if(isSelected&&!multi&&this.dimensions){const ps=furniturePolygon({...f,shape:'rectangle'});out+=this.dimension({x:ps[0].x,y:ps[0].y-15},{x:ps[1].x,y:ps[1].y-15},`${round(f.width)} cm`);}
    }
    for(const m of s.measurements){out+=`<g data-id="${m.id}"><path d="M${m.a.x},${m.a.y} L${m.b.x},${m.b.y}" stroke="transparent" stroke-width="16"/>${this.dimension(m.a,m.b,`${m.name} · ${round(distance(m.a,m.b))} cm`,'dimension measure')}`;if(selected===m.id&&!multi)for(const key of ['a','b'])out+=`<circle data-handle="${key}" cx="${m[key].x}" cy="${m[key].y}" r="6" class="handle"/>`;out+='</g>';}
    if(multi){const b=selectionBounds(s,ids);out+=`<g class="selection-outline"><rect x="${b.x-8}" y="${b.y-8}" width="${b.width+16}" height="${b.height+16}" fill="none" stroke="#287760" stroke-width="1.5" stroke-dasharray="7 4" pointer-events="none"/><path d="M${b.cx},${b.y-8} V${b.y-32}" stroke="#287760" pointer-events="none"/><circle data-id="${ids[0]}" data-handle="selection-rotate" cx="${b.cx}" cy="${b.y-32}" r="7" class="handle"/></g>`;}
    if(this.tool==='measure'&&this.cursor){const p=this.cursor;out+=`<g pointer-events="none"><circle cx="${p.x}" cy="${p.y}" r="${this.pointSnap?6:3}" fill="#fffefa" stroke="#ac8551" stroke-width="1.5"/><path d="M${p.x-10},${p.y} h20 M${p.x},${p.y-10} v20" stroke="#ac8551" stroke-width="1"/></g>`;if(this.points.length){const a=this.points[0];out+=`<text x="${(a.x+p.x)/2}" y="${(a.y+p.y)/2+15}" class="wall-length">ΔX ${round(Math.abs(p.x-a.x))} · ΔY ${round(Math.abs(p.y-a.y))} cm</text>`;}}
    if(this.points.length){
      const ps=[...this.points,...(this.cursor?[this.cursor]:[])];let path=`M${ps[0].x},${ps[0].y}`;
      if(this.tool==='curve'&&this.points.length===2&&this.cursor)path+=` Q${this.cursor.x},${this.cursor.y} ${this.points[1].x},${this.points[1].y}`;else path+=ps.slice(1).map(p=>` L${p.x},${p.y}`).join(' ');
      out+=`<path d="${path}" class="draft"/>`;for(const p of this.points)out+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#246e56"/>`;
      if(this.cursor&&this.points.length===1)out+=this.dimension(this.points[0],this.cursor,`${round(distance(this.points[0],this.cursor))} cm`);
    }
    if(this.drag?.type==='rectangle'&&this.cursor){const a=this.drag.p,b=this.cursor;out+=`<rect x="${Math.min(a.x,b.x)}" y="${Math.min(a.y,b.y)}" width="${Math.abs(a.x-b.x)}" height="${Math.abs(a.y-b.y)}" class="draft"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2}" class="wall-length">${Math.abs(a.x-b.x)} × ${Math.abs(a.y-b.y)} cm</text>`;}
    this.svg.innerHTML=out;this.cb.zoomLabel(`${Math.round((this.svg.clientWidth||700)/v.width*100)}%`);
  }
  exportSvg(){const b=sceneBounds(this.cb.getScene());const el=this.svg.cloneNode(true);el.setAttribute('xmlns','http://www.w3.org/2000/svg');el.setAttribute('viewBox',`${b.x-80} ${b.y-80} ${b.width+160} ${b.height+160}`);el.setAttribute('width',Math.ceil(b.width+160));el.setAttribute('height',Math.ceil(b.height+160));el.insertAdjacentHTML('afterbegin','<style>text{font-family:Arial,sans-serif;fill:#344f44;font-size:11px}.dimension path{fill:none;stroke:#418c76;stroke-width:1}.dimension text,.wall-length{text-anchor:middle;paint-order:stroke;stroke:#f7f8f2;stroke-width:4px}.control-line{fill:none;stroke:#388568;stroke-dasharray:4}.handle{fill:white;stroke:#287760}.room-area,.furniture-size{font-size:9px}</style>');return new XMLSerializer().serializeToString(el);}
}
