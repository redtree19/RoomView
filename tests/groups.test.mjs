import test from 'node:test';
import assert from 'node:assert/strict';
import { demoScene, validateScene, applyCommands, measurePoints } from '../src/core/model.js';
import { expandSelection, selectionBounds, selectionRoot } from '../src/core/groups.js';
const apply=(s,...commands)=>applyCommands(s,commands).scene;
const create={op:'group.create',id:'g',name:'桌椅组合',ids:['desk_1','chair_1']};
test('group persistence and old documents without groups',()=>{const old=demoScene();delete old.groups;assert.deepEqual(validateScene(old).groups,[]);const s=apply(old,create);assert.equal(validateScene(JSON.parse(JSON.stringify(s))).groups[0].name,'桌椅组合');assert.equal(selectionRoot(s,'desk_1'),'g');});
test('group translates and rotates around a shared center without altering relative spacing',()=>{
  const s=apply(demoScene(),create),a=s.furniture.find(f=>f.id==='desk_1'),b=s.furniture.find(f=>f.id==='chair_1'),bounds=selectionBounds(s,['g']);
  const moved=apply(s,{op:'selection.transform',ids:['g'],dx:30,dy:50});assert.equal(moved.furniture.find(f=>f.id===a.id).x,a.x+30);assert.equal(moved.furniture.find(f=>f.id===b.id).y,b.y+50);
  const rotated=apply(s,{op:'selection.transform',ids:['g'],rotation:90}),ra=rotated.furniture.find(f=>f.id===a.id),rb=rotated.furniture.find(f=>f.id===b.id);
  assert.ok(Math.abs(ra.x-(bounds.cx-(a.y-bounds.cy)))<1e-8);assert.ok(Math.abs(Math.hypot(ra.x-rb.x,ra.y-rb.y)-Math.hypot(a.x-b.x,a.y-b.y))<1e-8);assert.equal(ra.rotation,90);
});
test('nested grouping ungroups one level and copying preserves nesting with fresh IDs',()=>{
  const s=apply(demoScene(),create,{op:'group.create',id:'outer',ids:['g','bed_1']});assert.equal(selectionRoot(s,'desk_1'),'outer');
  const result=applyCommands(s,[{op:'selection.duplicate',ids:['outer']}]),copyId=result.results[0].ids[0];assert.equal(result.scene.groups.length,4);assert.equal(expandSelection(result.scene,[copyId]).length,3);assert.ok(!expandSelection(result.scene,[copyId]).includes('desk_1'));
  const ungroup=apply(s,{op:'group.ungroup',id:'outer'});assert.equal(ungroup.groups.length,1);assert.equal(selectionRoot(ungroup,'desk_1'),'g');
});
test('group movement deduplicates room walls and lock blocks the entire edit atomically',()=>{
  const s=apply(demoScene(),{op:'group.create',id:'g',ids:['room_main','wall_1','desk_1']});const moved=apply(s,{op:'selection.transform',ids:['g'],dx:10});assert.equal(moved.walls[0].a.x,10);
  const locked=apply(demoScene(),create,{op:'object.update',id:'desk_1',patch:{locked:true}});const before=JSON.stringify(locked);assert.throws(()=>apply(locked,{op:'selection.transform',ids:['g'],dx:50}),/锁定/);assert.equal(JSON.stringify(locked),before);
});
test('deleting a member removes degenerate groups and rejects cycles and shared ownership',()=>{
  const s=apply(demoScene(),create),deleted=apply(s,{op:'object.delete',id:'desk_1'});assert.deepEqual(deleted.groups,[]);assert.ok(deleted.furniture.some(f=>f.id==='chair_1'));
  const cycle=demoScene();cycle.groups=[{id:'g',name:'g',members:['h','desk_1']},{id:'h',name:'h',members:['g','chair_1']}];assert.throws(()=>validateScene(cycle),/循环/);
  const shared=demoScene();shared.groups=[{id:'g',name:'g',members:['desk_1','chair_1']},{id:'h',name:'h',members:['desk_1','bed_1']}];assert.throws(()=>validateScene(shared),/多个组合/);
});
test('point measure handles any two coordinates, independently of furniture',()=>{
  assert.deepEqual(measurePoints({x:-10,y:-20},{x:20,y:20}),{unit:'cm',a:{x:-10,y:-20},b:{x:20,y:20},distance:50,dx:30,dy:40});assert.throws(()=>measurePoints({x:NaN,y:0},{x:0,y:0}),/数字/);
});
