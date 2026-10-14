const point={type:'object',required:['x','y'],properties:{x:{type:'number',description:'厘米，向右为正'},y:{type:'number',description:'厘米，平面向下为正'}},additionalProperties:false};
const scalar={type:'number'};
const room={type:'object',required:['points'],properties:{id:{type:'string'},name:{type:'string'},points:{type:'array',minItems:3,items:point},height:scalar,color:{type:'string'}}};
const wall={type:'object',required:['a','b'],properties:{id:{type:'string'},name:{type:'string'},a:point,b:point,control:{...point,description:'可选，二次贝塞尔控制点；省略为直墙'},height:scalar,thickness:scalar,roomId:{type:'string'},openings:{type:'array',items:{type:'object',required:['id','type','offset','width','height','sill'],properties:{id:{type:'string'},type:{enum:['door','window']},offset:scalar,width:scalar,height:scalar,sill:scalar}}}}};
const furniture={type:'object',properties:{id:{type:'string'},name:{type:'string'},kind:{enum:['box','bed','sofa','table','chair','cabinet','rug','plant','round']},shape:{enum:['rectangle','ellipse','polygon',null],description:'自定义轮廓；null 恢复 kind 预设。ellipse 的宽深相等时为圆。自定义轮廓按 height 拉伸。'},vertices:{type:'array',minItems:3,maxItems:80,description:'polygon 必填；局部包围框归一化坐标 0～1，每轴须覆盖 0 和 1。不自交，支持凹多边形。修改宽深会缩放轮廓。',items:{type:'object',required:['x','y'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}}},x:scalar,y:scalar,width:scalar,depth:scalar,height:scalar,rotation:scalar,elevation:scalar,color:{type:'string'},locked:{type:'boolean'}}};
const command=(op,properties,required=[])=>({type:'object',required:['op',...required],properties:{op:{const:op},...properties},additionalProperties:false});
export const commandSchema={type:'object',required:['commands'],properties:{expectedRevision:{type:'integer',minimum:0,description:'先 GET /api/project；提供返回的 revision 以防覆盖他人更改'},dryRun:{type:'boolean',description:'只验证并返回结果，不保存'},commands:{type:'array',minItems:1,maxItems:100,items:{oneOf:[
  command('room.rectangle',{data:{type:'object',properties:{id:{type:'string'},name:{type:'string'},x:scalar,y:scalar,width:scalar,depth:scalar,height:scalar,thickness:scalar,withWalls:{type:'boolean'},color:{type:'string'}}}},['data']),
  command('room.add',{data:room},['data']),command('wall.add',{data:wall},['data']),command('furniture.add',{data:furniture},['data']),
  command('measurement.add',{data:{type:'object',required:['a','b'],properties:{id:{type:'string'},name:{type:'string'},a:point,b:point}}},['data']),
  command('object.update',{id:{type:'string'},patch:{type:'object',description:'部分属性合并。数组整体替换。房间 points 的修改不会自动移动独立墙体。'}},['id','patch']),
  command('object.delete',{id:{type:'string'}},['id']),command('object.duplicate',{id:{type:'string'}},['id']),
  command('group.create',{ids:{type:'array',items:{type:'string'},minItems:2},id:{type:'string'},name:{type:'string'}},['ids']),
  command('group.ungroup',{id:{type:'string'}},['id']),
  command('selection.transform',{ids:{type:'array',items:{type:'string'},minItems:1},dx:scalar,dy:scalar,rotation:{type:'number',description:'围绕选区包围框中心的顺时针旋转增量'},center:point},['ids']),
  command('selection.duplicate',{ids:{type:'array',items:{type:'string'},minItems:1}},['ids']),
  command('selection.delete',{ids:{type:'array',items:{type:'string'},minItems:1}},['ids']),
  command('scene.rename',{name:{type:'string'}},['name']),command('scene.load',{scene:{type:'object'}},['scene'])
]}}}};
export const toolsDefinition=[
  {type:'function',function:{name:'roomview_get_project',description:'读取 RoomView 当前布局、revision 和全部对象 ID。坐标和尺寸为 cm，家具 x/y 为中心，rotation 为平面顺时针角度。GET /api/project',parameters:{type:'object',properties:{}}}},
  {type:'function',function:{name:'roomview_apply_commands',description:'以原子批次操作布局。POST /api/commands。先读取 revision，再发送 expectedRevision。支持 dryRun。',parameters:commandSchema}},
  {type:'function',function:{name:'roomview_analyze',description:'分析重叠、越界、高度冲突和墙边净距。GET /api/analysis。按家具实际轮廓分析，椭圆采用 64 段近似。',parameters:{type:'object',properties:{}}}},
  {type:'function',function:{name:'roomview_measure',description:'测量两个平面坐标点的直线距离与水平/垂直分量，cm。GET /api/measure?ax=X&ay=Y&bx=X&by=Y',parameters:{type:'object',required:['a','b'],properties:{a:point,b:point}}}},
];
