import test from 'node:test';
import assert from 'node:assert/strict';
import { demoScene, emptyScene, validateScene, applyCommands, measureBetween } from '../src/core/model.js';
import { wallLength, wallAtDistance, analyze, polygonDistance, furniturePolygon, polygonArea } from '../src/core/geometry.js';

test('demo is valid, includes actual heights and openings',()=>{
  const s=validateScene(demoScene());assert.equal(s.rooms[0].height,280);assert.equal(s.walls[0].openings[0].type,'window');assert.equal(s.furniture.length,7);assert.equal(analyze(s).areaM2,29.76);
});
test('curved-wall arc measurement exceeds chord and distance lookup reaches endpoint',()=>{
  const w={a:{x:0,y:0},b:{x:200,y:0},control:{x:100,y:100}};const len=wallLength(w);assert.ok(len>229&&len<230);const last=wallAtDistance(w,len);assert.ok(Math.abs(last.x-200)<.1);assert.equal(wallLength({a:w.a,b:w.b}),200);
});
test('atomic batches reject invalid changes without mutating input',()=>{
  const s=demoScene(),before=JSON.stringify(s);assert.throws(()=>applyCommands(s,[{op:'object.update',id:'desk_1',patch:{x:25}},{op:'object.update',id:'bed_1',patch:{height:-2}}]),/高度/);assert.equal(JSON.stringify(s),before);
});
test('duplicate IDs, invalid polygons, NaN, excessive openings are rejected',()=>{
  const s=demoScene();s.furniture[1].id=s.furniture[0].id;assert.throws(()=>validateScene(s),/ID/);
  const bad=demoScene();bad.rooms[0].points=[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}];assert.throws(()=>validateScene(bad),/轮廓/);
  const inf=demoScene();inf.furniture[0].x=Infinity;assert.throws(()=>validateScene(inf),/数字/);
  assert.throws(()=>applyCommands(demoScene(),[{op:'object.update',id:'wall_1',patch:{height:100}}]),/门窗/);
});
test('height-aware furniture overlap and rectangle edge clearance',()=>{
  const s=emptyScene();s.furniture=[{id:'a',name:'A',kind:'box',width:100,depth:50,height:70,elevation:0,x:0,y:0,rotation:0,color:'#123456'}, {id:'b',name:'B',kind:'box',width:100,depth:50,height:50,elevation:0,x:130,y:0,rotation:0,color:'#123456'}];
  assert.equal(measureBetween(s,'a','b').edgeDistance,30);s.furniture[1].x=30;assert.equal(analyze(s).warnings.length,1);s.furniture[1].elevation=70;assert.equal(analyze(s).warnings.length,0);
});
test('rotated furniture has correct boundary footprint',()=>{
  const f={x:0,y:0,width:100,depth:40,rotation:90};const p=furniturePolygon(f);assert.ok(Math.abs(Math.max(...p.map(q=>q.x))-20)<1e-6);assert.equal(polygonArea(p),4000);
});
test('rectangle creates linked walls, removal leaves furniture',()=>{
  const r=applyCommands(emptyScene(),[{op:'room.rectangle',data:{id:'r',width:400,depth:300}},{op:'furniture.add',data:{id:'f',name:'desk',kind:'table'}}]);assert.equal(r.scene.walls.length,4);const deleted=applyCommands(r.scene,[{op:'object.delete',id:'r'}]);assert.equal(deleted.scene.rooms.length,0);assert.equal(deleted.scene.walls.length,0);assert.equal(deleted.scene.furniture.length,1);
});
test('nonrectangular room crossing is flagged even when footprint vertices lie in room',()=>{
  const s=emptyScene();s.rooms=[{id:'r',name:'concave',height:280,color:'#123456',points:[{x:0,y:0},{x:300,y:0},{x:300,y:300},{x:200,y:300},{x:200,y:100},{x:100,y:100},{x:100,y:300},{x:0,y:300}]}];s.furniture=[{id:'f',name:'bridge',kind:'box',x:150,y:200,width:280,depth:50,height:80,elevation:0,rotation:0,color:'#123456'}];assert.ok(analyze(s).warnings.some(w=>w.kind==='outside'));
});
test('nested hostile fields do not survive scene validation',()=>{
  const s=demoScene();s.furniture[0].arbitraryScript='bad';assert.equal(validateScene(s).furniture[0].arbitraryScript,undefined);assert.throws(()=>applyCommands(s,[{op:'arbitrary',id:'bed_1'}]),/未知命令/);
});
test('door opening leaves a real clearance gap in collision analysis',()=>{
  const s=emptyScene();s.walls=[{id:'w',name:'wall',a:{x:0,y:0},b:{x:300,y:0},thickness:10,height:280,openings:[{id:'door',type:'door',offset:100,width:100,height:210,sill:0}]}];s.furniture=[{id:'f',name:'box',kind:'box',x:150,y:0,width:50,depth:50,height:80,elevation:0,rotation:0,color:'#123456'}];assert.equal(analyze(s).warnings.filter(w=>w.kind==='wall').length,0);assert.equal(analyze(s).objects.f.nearestWallCm,25);s.furniture[0].height=250;assert.equal(analyze(s).warnings.filter(w=>w.kind==='wall').length,1);
});
test('negative rectangle dimensions are rejected',()=>{assert.throws(()=>applyCommands(emptyScene(),[{op:'room.rectangle',data:{width:-500}}]),/宽度/);});
