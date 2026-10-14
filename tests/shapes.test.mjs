import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyScene, applyCommands, validateScene, presets } from '../src/core/model.js';
import { furniturePolygon, furnitureLocalPolygon, furniturePolygonPatch, polygonDistance, polygonsOverlap, analyze } from '../src/core/geometry.js';
const create=(data)=>applyCommands(emptyScene(),[{op:'furniture.add',data:{id:'custom',...data}}]).scene;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('custom contours persist, resize, rotate, duplicate and accept concave shapes',()=>{
  let scene=create({...presets[10],x:200,y:200});const f=scene.furniture[0];assert.equal(f.vertices.length,6);
  assert.deepEqual(validateScene(JSON.parse(JSON.stringify(scene))),scene);
  scene=applyCommands(scene,[{op:'object.update',id:f.id,patch:{width:320,rotation:90}},{op:'object.duplicate',id:f.id}]).scene;
  assert.equal(scene.furniture[1].vertices.length,6);assert.equal(scene.furniture[1].width,320);
  const p=furniturePolygon(scene.furniture[0]);close(p[0].x,260);close(p[0].y,40);
  scene=applyCommands(scene,[{op:'object.update',id:f.id,patch:{shape:null}}]).scene;assert.equal(scene.furniture[0].shape,undefined);assert.equal(scene.furniture[0].vertices,undefined);
});
test('editing a rotated polygon recenters its dimensions without moving other vertices',()=>{
  const f=create({...presets[10],rotation:37}).furniture[0],before=furniturePolygon(f),ps=furnitureLocalPolygon(f);ps[0].x-=30;
  const after=furniturePolygon({...f,...furniturePolygonPatch(f,ps)});for(let i=1;i<after.length;i++){close(after[i].x,before[i].x);close(after[i].y,before[i].y);}
});
test('concave recess is empty; edge contact is not overlap; coincident outlines overlap',()=>{
  const f=create({...presets[10],x:0,y:0,width:100,depth:100}).furniture[0],p=furniturePolygon(f);
  const box=(x,y,w=20,d=20)=>furniturePolygon({kind:'box',x,y,width:w,depth:d,rotation:0});
  assert.equal(polygonsOverlap(p,box(20,20)),false);close(polygonDistance(p,box(20,20)),20);
  assert.equal(polygonsOverlap(p,box(-30,20)),true);assert.equal(polygonsOverlap(p,[...p].reverse()),true);
  assert.equal(polygonsOverlap(p,box(0,20)),false);assert.equal(polygonsOverlap(p,box(-5,20)),true);
});
test('ellipse uses actual perimeter, and invalid custom outlines are rejected atomically',()=>{
  const f=create({shape:'ellipse',width:100,depth:100,x:0,y:0}).furniture[0],p=furniturePolygon(f);assert.equal(p.length,64);
  const scene=create({shape:'ellipse',width:100,depth:100,x:0,y:0});const next=applyCommands(scene,[{op:'furniture.add',data:{id:'corner',x:45,y:45,width:10,depth:10}}]).scene;assert.equal(analyze(next).warnings.length,0);
  assert.throws(()=>create({shape:'polygon',vertices:[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}]}),/轮廓/);
  assert.throws(()=>create({shape:'polygon',vertices:[{x:0,y:0},{x:NaN,y:1},{x:1,y:0}]}),/数字/);
  assert.throws(()=>create({shape:'polygon',vertices:[{x:0,y:0},{x:.5,y:0},{x:0,y:1}]}),/范围/);
});
