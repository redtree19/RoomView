import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { View3D } from '../src/view3d.js';

function preview(walls,furniture=[]){
  const view=Object.create(View3D.prototype);
  Object.assign(view,{mode:'auto',wallParts:[],group:new THREE.Group(),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(38,1,1,100000),renderer:{render(){}},controls:{target:new THREE.Vector3(),update(){}}});
  view.rebuild({rooms:[],walls,furniture});return view;
}
const wall=(id,y,extra={})=>({id,a:{x:0,y},b:{x:400,y},height:280,thickness:12,openings:[],...extra});

test('full height and elevated window frames survive automatic and transparent modes',()=>{
  const view=preview([wall('back',0,{openings:[{id:'window',type:'window',offset:100,width:120,sill:90,height:120}]}),wall('front',300)]);
  assert.equal(new THREE.Box3().setFromObject(view.group).max.y,280);
  const frames=[];view.group.traverse(o=>{if(o.userData.openingId==='window'&&!o.userData.seeThrough)frames.push(o);});
  assert.equal(frames.length,4);assert.ok(frames.every(o=>o.material.opacity===1));
  const all=frames.reduce((b,m)=>b.union(new THREE.Box3().setFromObject(m)),new THREE.Box3());assert.equal(all.min.y,90);assert.equal(all.max.y,210);
  const front=view.wallParts.filter(p=>p.mesh.userData.objectId==='front'),back=view.wallParts.filter(p=>p.mesh.userData.objectId==='back');
  assert.ok(front.every(p=>p.mesh.userData.seeThrough));assert.ok(back.every(p=>!p.mesh.userData.seeThrough));
  const oldVersion=back[0].mesh.material.version;
  view.camera.position.z=-1000;view.render();assert.ok(front.every(p=>!p.mesh.userData.seeThrough));assert.ok(back.every(p=>p.mesh.userData.seeThrough));assert.ok(back[0].mesh.material.version>oldVersion,'opacity shader must refresh when a solid wall becomes transparent');
  view.setMode('ghost');assert.ok(view.wallParts.every(p=>p.mesh.material.opacity<.15&&!p.mesh.castShadow));
  view.setMode('full');assert.ok(view.wallParts.every(p=>p.mesh.material.opacity===1&&p.mesh.material.depthWrite));
});

test('fit includes tall walls and furniture in narrow viewports',()=>{
  const view=preview([wall('tall',0,{height:1600,control:{x:200,y:180}})]);
  view.camera.aspect=.4;view.camera.updateProjectionMatrix();view.fit();view.camera.lookAt(view.controls.target);view.camera.updateMatrixWorld();
  const b=new THREE.Box3().setFromObject(view.group);
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(view.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);}
  view.setMode('hidden');assert.equal(view.wallParts.length,0);
});

test('3D extrudes the concave footprint without filling its recess',()=>{
  const f={id:'shape',kind:'box',shape:'polygon',vertices:[{x:0,y:0},{x:1,y:0},{x:1,y:.4},{x:.4,y:.4},{x:.4,y:1},{x:0,y:1}],x:0,y:0,width:100,depth:100,height:75,elevation:10,rotation:0,color:'#b9aec9'};
  const view=preview([], [f]),box=new THREE.Box3().setFromObject(view.group);assert.ok(Math.abs(box.min.y-10)<1e-6);assert.ok(Math.abs(box.max.y-85)<1e-6);
  const meshes=[];view.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const ray=new THREE.Raycaster(new THREE.Vector3(20,200,20),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObjects(meshes,false).length,0);
  ray.ray.origin.x=-30;assert.ok(ray.intersectObjects(meshes,false).length>0);
});
