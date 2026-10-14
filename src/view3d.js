import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { wallLength, wallAtDistance, sampleWall, furnitureLocalPolygon } from './core/geometry.js';

export class View3D {
  constructor(container,onSelect){
    this.container=container;this.onSelect=onSelect;this.mode='auto';this.selected=null;this.wallParts=[];
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});}catch(e){container.innerHTML='<div class="webgl-error">当前设备未能启用 WebGL。2D 编辑仍可使用，请检查浏览器硬件加速。</div>';return;}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));this.renderer.setClearColor('#e9eeea');
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','三维空间预览');
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e9eeea');
    this.camera=new THREE.PerspectiveCamera(38,1,1,100000);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.maxPolarAngle=Math.PI/2-0.03;this.controls.minDistance=40;this.controls.maxDistance=50000;
    this.controls.addEventListener('change',()=>this.render());
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x7c8e81,2.6));
    const sun=new THREE.DirectionalLight(0xfff6e6,3);sun.position.set(500,1100,500);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-1500;sun.shadow.camera.right=1500;sun.shadow.camera.top=1500;sun.shadow.camera.bottom=-1500;sun.shadow.camera.far=5000;sun.shadow.normalBias=0.6;this.scene.add(sun);
    this.group=new THREE.Group();this.scene.add(this.group);this.raycaster=new THREE.Raycaster();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    let start;
    this.renderer.domElement.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
      const hit=this.raycaster.intersectObjects(this.group.children,true).find(h=>h.object.userData.objectId&&!h.object.userData.seeThrough);
      if(hit)this.onSelect(hit.object.userData.objectId,{toggle:e.ctrlKey||e.metaKey});
    });
  }
  resize(){if(!this.renderer)return;const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);const old=this.camera.aspect;this.camera.aspect=width/height;if(this.fitted)this.camera.position.sub(this.controls.target).multiplyScalar(Math.min(1,old)/Math.min(1,this.camera.aspect)).add(this.controls.target);this.camera.updateProjectionMatrix();this.render();}
  clear(){this.group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});this.group.clear();this.wallParts=[];}
  material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:0.85,metalness:0,...extra});}
  box(parent,w,h,d,x,y,z,color,id,extra={}){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1,w),Math.max(0.1,h),Math.max(0.1,d)),this.material(color,extra));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;if(id)mesh.userData.objectId=id;parent.add(mesh);return mesh;
  }
  outline(mesh,color='#718b83'){
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color,transparent:true,opacity:0.65,depthWrite:false}));mesh.add(edge);return edge;
  }
  wallPart(mesh,wall){
    const edge=this.outline(mesh,this.selected?.includes(wall.id)?'#24765e':'#718b83');
    this.wallParts.push({mesh,edge,center:wallAtDistance(wall,wallLength(wall)/2)});
  }
  updateWalls(){
    const target=this.controls.target,dx=this.camera.position.x-target.x,dz=this.camera.position.z-target.z;
    for(const {mesh,edge,center} of this.wallParts){
      // Fade the camera-side walls; retain their full geometry and height outline.
      const faded=this.mode==='ghost'||(this.mode==='auto'&&((center.x-target.x)*dx+(center.y-target.z)*dz>=-1));
      if(mesh.material.transparent!==faded){mesh.material.transparent=faded;mesh.material.needsUpdate=true;}
      mesh.material.opacity=faded?0.09:1;mesh.material.depthWrite=!faded;mesh.castShadow=!faded;
      mesh.userData.seeThrough=faded;edge.material.opacity=faded?0.5:0.22;
    }
  }
  rebuild(scene,selected=this.selected){
    this.data=scene;this.selected=selected;const selectedSet=new Set(Array.isArray(selected)?selected:selected?[selected]:[]);if(!this.renderer)return;this.clear();
    for(const room of scene.rooms){
      const shape=new THREE.Shape();room.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();
      const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:5,bevelEnabled:false}),this.material(room.color));mesh.rotation.x=-Math.PI/2;mesh.position.y=-5;mesh.receiveShadow=true;mesh.userData.objectId=room.id;this.group.add(mesh);
    }
    for(const wall of scene.walls){
      if(this.mode==='hidden')continue;
      const len=wallLength(wall),height=wall.height;
      if(wall.control&&!wall.openings.length){
        const ps=sampleWall(wall,96),left=[],right=[];
        ps.forEach((p,i)=>{const a=ps[Math.max(0,i-1)],b=ps[Math.min(ps.length-1,i+1)],l=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/l*wall.thickness/2,ny=(b.x-a.x)/l*wall.thickness/2;left.push({x:p.x+nx,y:p.y+ny});right.push({x:p.x-nx,y:p.y-ny});});
        const shape=new THREE.Shape();[...left,...right.reverse()].forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),this.material(selectedSet.has(wall.id)?'#589b88':'#e3e1d7'));mesh.rotation.x=-Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.objectId=wall.id;this.group.add(mesh);this.wallPart(mesh,wall);continue;
      }
      const cuts=[0,len,...wall.openings.flatMap(o=>[o.offset,o.offset+o.width])];
      if(wall.control)for(let d=10;d<len;d+=10)cuts.push(d);
      cuts.sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const from=cuts[i-1],to=cuts[i];if(to-from<0.01)continue;
        const a=wallAtDistance(wall,from),b=wallAtDistance(wall,to),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,seg=Math.hypot(b.x-a.x,b.y-a.y),angle=-Math.atan2(b.y-a.y,b.x-a.x);
        const opening=wall.openings.find(o=>(from+to)/2>o.offset&&(from+to)/2<o.offset+o.width);
        const pieces=opening?[[0,Math.min(height,opening.sill)],[Math.min(height,opening.sill+opening.height),height]]:[[0,height]];
        for(const [bottom,top] of pieces){if(top-bottom<0.1)continue;const m=this.box(this.group,seg+0.3,top-bottom,wall.thickness,cx,(top+bottom)/2,cy,selectedSet.has(wall.id)?'#589b88':'#e3e1d7',wall.id);m.rotation.y=angle;this.wallPart(m,wall);}
        if(opening?.type==='window'){
          const frame=new THREE.Group();frame.position.set(cx,opening.sill,cy);frame.rotation.y=angle;this.group.add(frame);
          const glass=this.box(frame,seg,opening.height,2,0,opening.height/2,0,'#70bdce',wall.id,{transparent:true,opacity:0.2,depthWrite:false});glass.castShadow=false;glass.userData.openingId=opening.id;glass.userData.seeThrough=true;
          const bar=(w,h,x,y)=>{const m=this.box(frame,w,h,Math.min(5,wall.thickness),x,y,0,selectedSet.has(wall.id)?'#24765e':'#417d8b',wall.id);m.castShadow=false;m.userData.openingId=opening.id;};
          const t=Math.min(3,opening.height/4,opening.width/4);
          bar(seg,t,0,t/2);bar(seg,t,0,opening.height-t/2);
          if(Math.abs(from-opening.offset)<.01)bar(t,opening.height,-seg/2+t/2,opening.height/2);
          if(Math.abs(to-opening.offset-opening.width)<.01)bar(t,opening.height,seg/2-t/2,opening.height/2);
        }
      }
    }
    for(const f of scene.furniture){
      const group=new THREE.Group();group.position.set(f.x,f.elevation,f.y);group.rotation.y=-f.rotation*Math.PI/180;this.group.add(group);
      const w=f.width,d=f.depth,h=f.height,c=f.color,id=f.id;
      const b=(bw,bh,bd,x,y,z,col=c)=>this.box(group,bw,bh,bd,x,y,z,col,id);
      const legs=(top)=>{const t=Math.min(5,w/10,d/10);for(const x of [-1,1])for(const z of [-1,1])b(t,top,t,x*(w/2-t),top/2,z*(d/2-t),'#70776a');};
      if(f.shape){
        const shape=new THREE.Shape();furnitureLocalPolygon(f).forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}),this.material(c));mesh.rotation.x=-Math.PI/2;mesh.userData.objectId=id;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);this.outline(mesh,selectedSet.has(id)?'#24765e':'#78857e');
      }else if(f.kind==='bed'){
        b(w,h*0.56,d,0,h*0.28,0);b(w*0.95,h*0.22,d*0.96,0,h*0.67,0,'#f5f3e9');b(w,h,d*0.05,0,h/2,-d*0.475);
        b(w*0.9,h*0.05,d*0.55,0,h*0.805,d*0.16,c);for(const x of [-1,1])b(w*0.38,h*0.14,d*0.16,x*w*0.23,h*0.85,-d*0.3,'#f9f6ed');
      }else if(f.kind==='sofa'){
        b(w,h*0.38,d,0,h*0.24,0);b(w,h*0.58,d*0.2,0,h*0.71,d*0.4);for(const x of [-1,1])b(w*0.08,h*0.7,d,x*w*0.46,h*0.35,0);
        for(const x of [-1,1])b(w*0.4,h*0.15,d*0.73,x*w*0.205,h*0.5,-d*0.04,'#dbc0a5');
      }else if(f.kind==='table'||f.kind==='chair'){
        const top=f.kind==='chair'?h*0.5:h;legs(top*0.92);b(w,Math.min(6,top*0.1),d,0,top-Math.min(3,top*0.05),0);if(f.kind==='chair')b(w,h*0.5,d*0.08,0,h*0.75,d*0.46);
      }else if(f.kind==='round'){
        const mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,Math.min(6,h*0.1),48),this.material(c));mesh.scale.set(w,1,d);mesh.position.y=h-Math.min(3,h*0.05);mesh.userData.objectId=id;mesh.castShadow=true;group.add(mesh);b(w*0.12,h-5,d*0.12,0,(h-5)/2,0,'#787b70');
      }else if(f.kind==='plant'){
        const pot=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w,d)*0.3,Math.min(w,d)*0.22,h*0.3,20),this.material('#c5b5a0'));pot.position.y=h*0.15;pot.userData.objectId=id;pot.castShadow=true;group.add(pot);
        const crown=new THREE.Mesh(new THREE.SphereGeometry(0.5,20,16),this.material(c));crown.scale.set(w,h*0.7,d);crown.position.y=h*0.65;crown.userData.objectId=id;crown.castShadow=true;group.add(crown);
      }else{b(w,h,d,0,h/2,0);if(f.kind==='cabinet'){b(1,h*0.92,0.5,0,h/2,d/2+0.1,'#7d8b9b');for(const x of [-1,1])b(2,10,2,x*5,h*0.52,d/2+1,'#495c62');}}
      if(selectedSet.has(id)){const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w+2,h+2,d+2)),new THREE.LineBasicMaterial({color:'#24765e'}));outline.position.y=h/2;group.add(outline);}
    }
    if(!this.fitted){this.fit();this.fitted=true;}this.render();
  }
  fit(top=false){if(!this.renderer||!this.data)return;this.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(this.group);if(bounds.isEmpty())bounds.set(new THREE.Vector3(-150,0,-150),new THREE.Vector3(150,280,150));const sphere=bounds.getBoundingSphere(new THREE.Sphere()),half=THREE.MathUtils.degToRad(this.camera.fov/2),angle=Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect)),distance=Math.max(100,sphere.radius)*1.15/Math.sin(angle);this.controls.target.copy(sphere.center);const direction=top?new THREE.Vector3(0,1,.001):new THREE.Vector3(1.05,1.18,1.22).normalize();this.camera.position.copy(sphere.center).addScaledVector(direction,distance);this.controls.update();this.render();}
  setMode(mode){this.mode=mode;this.rebuild(this.data);}
  render(){if(this.renderer){this.updateWalls();this.renderer.render(this.scene,this.camera);}}
  screenshot(){this.render();return this.renderer?.domElement.toDataURL('image/png');}
}
