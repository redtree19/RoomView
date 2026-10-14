import './style.css';
import './groups.css';
import { demoScene, emptyScene, validateScene, applyCommands, clone, presets, uid, locate, measurePoints } from './core/model.js';
import { selectionRoot, expandSelection, selectionBounds } from './core/groups.js';
import { analyze, distance, round, wallLength, sceneBounds, polygonArea, furnitureLocalPolygon, furniturePolygonPatch } from './core/geometry.js';
import { commandSchema, toolsDefinition } from './core/schema.js';
import { Plan2D, escapeHtml as esc } from './plan2d.js';
import { View3D } from './view3d.js';

let scene=demoScene(),selected=null,analysis=analyze(scene),revision=null,online=false,dirty=false,saving=false,conflicted=false,ready=false,saveTimer,pollTimer,previewFrame;
let undo=[],redo=[],selectedIds=[];const LOCAL_KEY='roomview.scene.v1';
const $=selector=>document.querySelector(selector);
const icons={select:'↖',pan:'✥',room:'▭',polygon:'⬡',wall:'╱',curve:'⌒',measure:'↔'};
const toolLabels={select:'选择',pan:'平移',room:'矩形房间',polygon:'多边形',wall:'直墙',curve:'曲线墙',measure:'测距'};
const tips={select:'Ctrl + 点击多选 · Ctrl+G 组合 · Ctrl+Shift+G 取消组合 · R 旋转',pan:'拖动平移画布 · 滚轮缩放',room:'拖出房间轮廓；松开创建房间和四面墙',polygon:'依次点击顶点 · Enter 或点击起点闭合 · Esc 取消',wall:'点击起点、终点；长度可在属性中精确调整',curve:'依次点击起点、终点、控制点；选中后拖控制点调整弯曲',measure:'点击起点和终点测距 · 自动吸附角点/端点 · Alt 自由选点'};
document.querySelector('#app').innerHTML=`
<header class="topbar">
  <a class="brand" href="#" aria-label="RoomView 首页"><span class="brand-mark">R<span>v</span></span><span>RoomView<small>空间布局工作台</small></span></a>
  <div class="project-title"><input id="project-name" aria-label="方案名称" value="${esc(scene.name)}" maxlength="120"/><span id="save-status"><i></i>正在加载</span></div>
  <div class="header-actions"><button id="undo" title="撤销 Ctrl+Z" aria-label="撤销">↶</button><button id="redo" title="重做 Ctrl+Shift+Z" aria-label="重做">↷</button><span class="separator"></span><button id="import" class="text-button">导入</button><button id="export" class="text-button">导出</button><button id="ai-open" class="ai-button"><span>⌘</span> AI 接入</button></div>
</header>
<main class="workspace">
  <aside class="left-panel">
    <div class="panel-heading"><div><small>BUILD YOUR SPACE</small><h2>构建空间</h2></div><button id="new-scene" title="新建空白方案" aria-label="新建方案">＋</button></div>
    <div class="side-tabs"><button class="active" data-tab="library">家具库</button><button data-tab="objects">场景对象 <span id="object-count">0</span></button></div>
    <div id="library-tab">
      <p class="section-label">基础家具 <span>可自由调整尺寸</span></p>
      <div class="furniture-library">${presets.map((p,i)=>`<button class="preset" data-preset="${i}"><span class="preset-art kind-${p.kind}" style="--swatch:${p.color}">${p.symbol}</span><strong>${p.name}</strong><small>${p.width} × ${p.depth} × ${p.height}</small></button>`).join('')}</div>
      <button id="draw-furniture" class="wide-button">＋ 逐点绘制异形家具</button>
      <div class="tip-card"><span>↗</span><div><b>先尺寸，后布局</b><p>点击家具添加到房间。<br>宽 × 深 × 高，单位均为厘米。</p></div></div>
      <button id="quick-room" class="wide-button">＋ 按尺寸创建房间</button>
    </div>
    <div id="objects-tab" hidden><input id="object-search" placeholder="搜索名称或 ID…" aria-label="搜索对象"/><div id="object-list"></div></div>
    <div class="side-footer"><span class="status-dot"></span>本地优先 · 无需账号<button id="help-open" aria-label="操作帮助">?</button></div>
  </aside>
  <section class="center-panel">
    <div class="canvas-toolbar"><div class="tools">${Object.keys(icons).map(t=>`<button data-tool="${t}" class="tool ${t==='select'?'active':''}" title="${toolLabels[t]}" aria-label="${toolLabels[t]}"><span>${icons[t]}</span><small>${toolLabels[t]}</small></button>`).join('')}</div><div class="view-toggle"><button data-view="2d">2D</button><button data-view="split" class="active">双视图</button><button data-view="3d">3D</button></div></div>
    <div class="view-workspace split" id="views">
      <section id="plan-pane" class="view-pane"><div class="view-heading"><span><i class="tiny-square"></i>平面布局 <small>TOP VIEW</small></span><button id="fit-plan" title="居中显示全部内容">适应画布 ⤢</button></div><svg id="plan" aria-label="二维布局画布" tabindex="0"></svg><div class="plan-controls"><button id="zoom-out" aria-label="缩小">−</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="放大">＋</button><span class="separator"></span><label><input type="checkbox" id="snap" checked/>吸附</label><select id="grid" aria-label="网格间距"><option value="1">1 cm</option><option value="5">5 cm</option><option value="10" selected>10 cm</option><option value="20">20 cm</option></select><label><input type="checkbox" id="dimensions" checked/>尺寸</label></div><div class="orientation">N <span>↑</span></div></section>
      <section id="three-pane" class="view-pane"><div class="view-heading"><span><i class="tiny-square solid"></i>空间预览 <small>LIVE 3D</small></span><select id="wall-mode" aria-label="3D 墙体显示"><option value="auto">自动透明遮挡墙</option><option value="full">完整墙高</option><option value="ghost">全部透明轮廓</option><option value="hidden">隐藏墙体</option></select></div><div id="three-container"></div><div class="three-controls"><button id="orbit-view" class="active">透视</button><button id="top-view">俯视</button><button id="fit-three" title="重置三维视角">⤢</button></div><div class="three-hint">拖动旋转 · 右键平移 · 滚轮缩放</div></section>
    </div>
    <div class="canvas-status"><span id="tool-tip">${tips.select}</span><span id="coordinates">X 0 · Y 0 cm</span></div>
    <div class="summary-strip"><div><small>房间面积</small><strong id="total-area">—</strong></div><div><small>家具数量</small><strong id="furniture-count">—</strong></div><button id="warnings-open"><span class="check-icon">✓</span><span id="warning-summary">布局检查</span><span>↗</span></button><div class="unit-note">所有尺寸单位 <b>cm</b></div></div>
  </section>
  <aside class="right-panel"><div class="panel-heading"><div><small>PROPERTIES</small><h2>对象属性</h2></div><span id="selection-badge">未选择</span></div><div id="inspector"></div><div id="selection-analysis"></div></aside>
</main>
<div id="toast" role="status"></div>
<dialog id="modal"><div class="modal-head"><h2 id="modal-title"></h2><button id="modal-close" aria-label="关闭对话框">×</button></div><div id="modal-body"></div></dialog>
<input id="file-input" type="file" accept=".json,application/json" hidden/>
`;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
const view3d=new View3D($('#three-container'),(id,options)=>select(id,options));
const plan=new Plan2D($('#plan'),{getScene:()=>scene,getSelected:()=>selected,getSelection:()=>selectedIds,getAnalysis:()=>analysis,select,execute,preview,commit,setTool,toast,coordinates:p=>{$('#coordinates').textContent=`X ${p.x} · Y ${p.y} cm`;},zoomLabel:t=>{$('#zoom-label').textContent=t;}});
function setTool(tool){plan.setTool(tool);document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('#tool-tip').textContent=tool==='furniture'?'绘制家具轮廓 · Enter 或点击起点闭合 · Esc 取消':tips[tool];}
function normalizeSelection(){selectedIds=[...new Set(selectedIds.filter(id=>locate(scene,id)).map(id=>selectionRoot(scene,id)))];selected=selectedIds.length===1?selectedIds[0]:null;}
function select(id,{toggle=false,preserve=false}={}){const root=id?selectionRoot(scene,id):null;if(!root){if(!toggle)selectedIds=[];}else if(toggle)selectedIds=selectedIds.includes(root)?selectedIds.filter(v=>v!==root):[...selectedIds,root];else if(!preserve||!selectedIds.includes(root))selectedIds=[root];normalizeSelection();plan.render();view3d.rebuild(scene,expandSelection(scene,selectedIds));renderInspector();renderObjects();}
function preview(next){scene=next;plan.render();if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=null;view3d.rebuild(scene,expandSelection(scene,selectedIds));});}
function commit(before){try{scene=validateScene(scene);undo.push(before);undo=undo.slice(-80);redo=[];changed();}catch(e){scene=before;renderAll();toast(e.message);}}
function execute(commands){if(!ready)return;try{const result=applyCommands(scene,commands);undo.push(clone(scene));undo=undo.slice(-80);redo=[];scene=result.scene;const last=result.results.at(-1);if(commands.some(c=>c.op==='scene.load'))selectedIds=[];if(last?.ids)selectedIds=last.ids;else if(last?.id&&locate(scene,last.id))selectedIds=[last.id];normalizeSelection();changed();return result;}catch(e){toast(e.message);throw e;}}
function changed(){dirty=true;analysis=analyze(scene);storeLocal();renderAll();scheduleSave();document.dispatchEvent(new CustomEvent('roomview:change',{detail:{scene:clone(scene)}}));}
function storeLocal(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify({scene,baseRevision:revision,dirty}));}catch{toast('浏览器存储失败，请导出 JSON 备份');}}
function renderAll(){
  normalizeSelection();
  analysis=analyze(scene);$('#project-name').value=scene.name;$('#total-area').innerHTML=`${analysis.areaM2}<em>m²</em>`;$('#furniture-count').innerHTML=`${scene.furniture.length}<em>件</em>`;
  $('#warning-summary').textContent=analysis.warnings.length?`${analysis.warnings.length} 项空间提醒`:'未发现摆放冲突';$('#warnings-open').classList.toggle('has-warnings',analysis.warnings.length>0);
  $('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;plan.render();view3d.rebuild(scene,expandSelection(scene,selectedIds));renderObjects();renderInspector();status();
}
function status(){const el=$('#save-status');el.className=conflicted?'warning':'';el.innerHTML=`<i></i>${conflicted?'同步冲突 · 点击处理':!ready?'正在加载':saving?'正在保存':dirty?(online?'等待保存':'已保存在此浏览器'):(online?'已保存到本机':'本地浏览器模式')}`;}
function scheduleSave(){clearTimeout(saveTimer);status();if(online&&!conflicted)saveTimer=setTimeout(save,400);}
async function save(){
  if(!online||!dirty||saving||conflicted)return;const snapshot=clone(scene);saving=true;status();
  try{const res=await fetch('/api/project',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:revision,scene:snapshot})});const data=await res.json();
    if(res.status===409){conflicted=true;toast('AI 或其他页面更新了布局，请点击顶部同步冲突处理');return;}
    if(!res.ok)throw new Error(data.error);revision=data.revision;dirty=JSON.stringify(scene)!==JSON.stringify(snapshot);storeLocal();
  }catch(e){online=false;toast(`本机服务连接失败，已保留浏览器备份：${e.message}`);}finally{saving=false;status();if(dirty&&online&&!conflicted)scheduleSave();}
}
async function poll(){
  if(saving||plan.drag)return;
  try{const res=await fetch('/api/project');if(!res.ok)return;const data=await res.json();if(data.storageError)return;
    if(!online){online=true;if(dirty&&revision!==data.revision){conflicted=true;status();return;}}
    if(data.revision!==revision){if(dirty){conflicted=true;status();return;}scene=validateScene(data.scene);revision=data.revision;undo=[];redo=[];if(selected&&!locate(scene,selected))selected=null;storeLocal();renderAll();}
    if(dirty&&!conflicted)scheduleSave();
  }catch{online=false;status();}
}
async function init(){
  let backup;
  try{const raw=localStorage.getItem(LOCAL_KEY);if(raw){backup=JSON.parse(raw);scene=validateScene(backup.scene||backup);dirty=Boolean(backup.dirty);revision=backup.baseRevision??null;}}catch{toast('浏览器备份不可用，已加载示例');}
  try{const res=await fetch('/api/project');if(res.ok){const data=await res.json();if(data.storageError)toast(data.storageError);else{online=true;if(dirty&&JSON.stringify(scene)!==JSON.stringify(data.scene)){conflicted=revision!==data.revision;if(conflicted)toast('发现未同步的浏览器备份，点击顶部同步冲突处理');}else{scene=validateScene(data.scene);dirty=false;}revision=data.revision;}}}catch{}
  ready=true;renderAll();plan.fit();view3d.fit();if(dirty&&!conflicted)scheduleSave();pollTimer=setInterval(poll,1700);
}
function renderObjects(){const query=$('#object-search').value.toLowerCase(),active=new Set([...selectedIds,...expandSelection(scene,selectedIds)]);const groups=[['groups','组合'],['rooms','房间'],['walls','墙体'],['furniture','家具'],['measurements','标注']];$('#object-count').textContent=groups.reduce((n,[k])=>n+(scene[k]||[]).length,0);$('#object-list').innerHTML=groups.map(([key,name])=>`<div class="object-group"><h3>${name}<span>${(scene[key]||[]).length}</span></h3>${(scene[key]||[]).filter(o=>(o.name+o.id).toLowerCase().includes(query)).map(o=>`<button class="object-row ${active.has(o.id)?'active':''}" data-select="${o.id}"><i style="background:${o.color||'#95aba0'}"></i><span>${esc(o.name)}<small>${o.id}${o.members?` · ${o.members.length} 个成员`:''}</small></span>${o.locked?'▪':'›'}</button>`).join('')}</div>`).join('');}
function input(label,key,value,type='number',attrs=''){return `<label class="field"><span>${label}</span><input data-field="${key}" type="${type}" value="${esc(value)}" ${type==='number'?'step="1"':''} ${attrs}/></label>`;}
function coords(label,key,p){return `<div class="property-section"><h3>${label}</h3><div class="field-grid">${input('X',`${key}.x`,p.x)}${input('Y',`${key}.y`,p.y)}</div></div>`;}
function shapeInspector(f){
  return `<div class="property-section"><h3>家具形状</h3><label class="field"><span>轮廓类型</span><select data-field="shape">${[['','原有家具模型'],['rectangle','矩形'],['ellipse','圆形 / 椭圆'],['polygon','自定义多边形']].map(([v,label])=>`<option value="${v}" ${(f.shape||'')===v?'selected':''}>${label}</option>`).join('')}</select></label><div class="button-pair"><button id="shape-circle">设为正圆</button><button id="shape-l">L 形轮廓</button></div>${f.shape==='polygon'?`<p class="footnote">拖动平面图上的白色顶点；也可输入相对中心的局部坐标（cm）。＋ 在该点后插入，− 删除。</p><div class="shape-vertices">${furnitureLocalPolygon(f).map((p,i)=>`<div class="vertex-row"><span>${i+1}</span>${input('X',`vertex.${i}.x`,round(p.x,2))}${input('Y',`vertex.${i}.y`,round(p.y,2))}<button data-vertex-insert="${i}" title="在此顶点后插入" ${f.vertices.length>=80?'disabled':''}>＋</button><button data-vertex-remove="${i}" title="删除此顶点" ${f.vertices.length<=3?'disabled':''}>−</button></div>`).join('')}</div>`:'<p class="footnote">圆形的宽深相等；分别调整宽深可得到椭圆。自定义轮廓在 3D 中按高度拉伸。</p>'}</div>`;
}
function renderInspector(){
  const found=locate(scene,selected);$('#selection-analysis').innerHTML='';
  if(selectedIds.length>1||found?.key==='groups'){renderGroupInspector();return;}
  if(!found){$('#selection-badge').textContent='未选择';$('#inspector').innerHTML=`<div class="empty-selection"><div class="selection-illustration">⌖</div><h3>让每一厘米都有位置</h3><p>点击画布中的家具、墙体或房间，<br>在这里精确调整尺寸与位置。</p></div><div class="property-section"><h3>快速开始</h3><ol class="quick-steps"><li>画房间，或按尺寸创建</li><li>放入家具并调整宽深高</li><li>切换 3D，检查空间关系</li><li>用测距工具标出通道宽度</li></ol><button id="demo-load" class="wide-button">载入示例方案</button></div><div class="property-section quiet-note">曲线：起点 → 终点 → 控制点<br>选中曲线后可拖动三个控制柄。</div>`;return;}
  const {key,object:o}=found;const typeNames={rooms:'房间',walls:o.control?'曲线墙':'直墙',furniture:'家具',measurements:'标注'};$('#selection-badge').textContent=typeNames[key];
  let html=`<div class="selected-header"><span class="selected-swatch" style="background:${o.color||'#97ada0'}">${key==='walls'?'⌒':key==='rooms'?'⬡':'□'}</span><div><h3>${esc(o.name)}</h3><code title="AI 操作对象 ID">${o.id}</code></div></div>${input('名称','name',o.name,'text','maxlength="120"')}`;
  if(key==='furniture'){
    html+=shapeInspector(o);
    html+=`<div class="property-section"><h3>尺寸 <small>cm</small></h3><div class="field-grid">${input('宽度','width',o.width,'number','min="1"')}${input('深度','depth',o.depth,'number','min="1"')}${input('高度','height',o.height,'number','min="0.1"')}${input('离地高度','elevation',o.elevation,'number','min="0"')}</div></div><div class="property-section"><h3>位置与朝向 <small>中心点</small></h3><div class="field-grid">${input('X','x',o.x)}${input('Y','y',o.y)}${input('旋转角度 °','rotation',o.rotation)}${input('颜色','color',o.color,'color')}</div><button id="rotate-object" class="wide-button">↻ 旋转 90°</button></div><label class="check-field"><input type="checkbox" id="lock-object" ${o.locked?'checked':''}/>锁定位置</label><div class="button-pair"><button id="duplicate-object">复制家具</button><button id="delete-object" class="danger">删除</button></div>`;
    const info=analysis.objects[o.id];$('#selection-analysis').innerHTML=`<div class="analysis-card"><h3>空间检查</h3><div class="metric-row"><span>距最近墙体</span><b>${info?.nearestWallCm??'—'} cm</b></div>${analysis.warnings.filter(w=>w.ids.includes(o.id)).map(w=>`<p class="warning-line">△ ${esc(w.message)}</p>`).join('')||'<p class="success-line">✓ 未发现轮廓冲突</p>'}<p class="footnote">净距按家具轮廓计算；椭圆为 64 段近似，不含开门或抽屉空间。</p></div><button id="point-measure" class="wide-button">选点测距 · M</button>`;
  }else if(key==='walls'){
    html+=`<div class="property-section"><h3>墙体尺寸 <small>cm</small></h3><div class="field-grid">${input('厚度','thickness',o.thickness)}${input('高度','height',o.height)}${!o.control?input('长度','wallLength',round(wallLength(o))):`<div class="readout"><span>曲线弧长</span><b>${round(wallLength(o))}</b></div>`}</div></div>${coords('起点','a',o.a)}${coords('终点','b',o.b)}${o.control?coords('贝塞尔控制点','control',o.control):''}<button id="toggle-curve" class="wide-button">${o.control?'改为直墙':'改为曲线墙'}</button><div class="property-section"><h3>门与窗 <small>沿墙起点计算</small></h3><div class="button-pair"><button id="add-door">＋ 门</button><button id="add-window">＋ 窗</button></div>${o.openings.map(v=>`<div class="opening-card"><div><b>${v.type==='door'?'门洞':'窗洞'}</b><button data-remove-opening="${v.id}" aria-label="删除开口">×</button></div><div class="field-grid">${input('偏移',`opening.${v.id}.offset`,v.offset)}${input('宽度',`opening.${v.id}.width`,v.width)}${input('高度',`opening.${v.id}.height`,v.height)}${input('底高',`opening.${v.id}.sill`,v.sill)}</div></div>`).join('')}</div><button id="delete-object" class="wide-button danger">删除墙体</button><p class="footnote">墙体与地面轮廓独立编辑。移动整间房时，关联墙体会一起移动。</p>`;
  }else if(key==='rooms'){
    html+=`<div class="property-section"><h3>空间信息</h3><div class="field-grid">${input('层高 cm','height',o.height)}${input('地面颜色','color',o.color,'color')}</div><div class="metric-row"><span>地面面积</span><b>${round(polygonArea(o.points)/10000,2)} m²</b></div><button id="room-height-walls" class="wide-button">将层高应用到关联墙体</button></div><div class="property-section"><h3>房间轮廓 <small>顶点坐标 cm</small></h3>${o.points.map((p,i)=>`<div class="vertex-row"><span>${i+1}</span>${input('X',`point.${i}.x`,p.x)}${input('Y',`point.${i}.y`,p.y)}</div>`).join('')}<p class="footnote">修改轮廓顶点只改变地面。若墙体需跟随，请使用下方按钮重建；该操作会移除关联墙体的门窗。</p><button id="rebuild-walls" class="wide-button">按轮廓重建墙体…</button></div><button id="delete-object" class="wide-button danger">删除房间与关联墙体…</button>`;
  }else{
    html+=`<div class="property-section"><h3>测量结果</h3><strong class="large-readout">${round(distance(o.a,o.b))}<small>cm</small></strong><div class="metric-row"><span>水平 / 垂直分量</span><b>${round(Math.abs(o.b.x-o.a.x))} / ${round(Math.abs(o.b.y-o.a.y))} cm</b></div></div>${coords('起点','a',o.a)}${coords('终点','b',o.b)}<button id="delete-object" class="wide-button danger">删除标注</button>`;
  }
  $('#inspector').innerHTML=html;
}
function renderGroupInspector(){
  const group=scene.groups.find(g=>g.id===selected),bounds=selectionBounds(scene,selectedIds),leaves=expandSelection(scene,selectedIds),locked=scene.furniture.some(f=>leaves.includes(f.id)&&f.locked);
  $('#selection-badge').textContent=group?'组合':`${selectedIds.length} 项多选`;
  $('#inspector').innerHTML=`<div class="selected-header"><span class="selected-swatch">▣</span><div><h3>${group?esc(group.name):'多个对象'}</h3><code>${group?group.id:`已选择 ${selectedIds.length} 项`}</code></div></div>${group?input('组合名称','name',group.name,'text','maxlength="120"'):''}<div class="button-pair"><button id="group-selection" ${selectedIds.length<2?'disabled':''}>组合 Ctrl+G</button><button id="ungroup-selection" ${selectedIds.some(id=>scene.groups.some(g=>g.id===id))?'':'disabled'}>取消组合</button></div><div class="property-section"><h3>整体位置 <small>包围框中心 cm</small></h3><div class="field-grid">${input('中心 X','selection.x',round(bounds.cx))}${input('中心 Y','selection.y',round(bounds.cy))}${input('旋转增量 °','selection.rotation',0)}</div><button id="rotate-object" class="wide-button" ${locked?'disabled':''}>↻ 整体旋转 90°</button><div class="metric-row"><span>占地包围框</span><b>${round(bounds.width)} × ${round(bounds.height)} cm</b></div></div><div class="property-section"><h3>成员 <small>${leaves.length} 个对象</small></h3><div class="group-members">${selectedIds.map(id=>{const o=locate(scene,id).object;return `<div>${esc(o.name)}${o.members?` · ${o.members.length} 个成员`:''}</div>`;}).join('')}</div><p class="footnote">Ctrl + 点击添加或移出选区；组合后点击任意成员即可整体选中。Ctrl+Shift+G 逐层取消组合。</p>${locked?'<p class="warning-line">包含锁定家具，取消组合并解锁后可整体移动。</p>':''}</div><div class="button-pair"><button id="duplicate-object">整体复制</button><button id="delete-object" class="danger">删除所选</button></div>`;
}
function groupSelection(){if(selectedIds.length<2){toast('按住 Ctrl 点击至少两个对象');return;}execute([{op:'group.create',ids:[...selectedIds]}]);}
function ungroupSelection(){const ids=selectedIds.filter(id=>scene.groups.some(g=>g.id===id));if(!ids.length)return;const members=selectedIds.flatMap(id=>scene.groups.find(g=>g.id===id)?.members||[id]);execute(ids.map(id=>({op:'group.ungroup',id})));selectedIds=members;normalizeSelection();renderAll();}
function transformSelected(patch){if(selectedIds.length)execute([{op:'selection.transform',ids:[...selectedIds],...patch}]);}
function duplicateSelected(){if(selectedIds.length)execute([{op:'selection.duplicate',ids:[...selectedIds]}]);}
function deleteSelected(){if(!selectedIds.length)return;const ids=[...selectedIds],leaves=expandSelection(scene,ids);const action=()=>execute([{op:'selection.delete',ids}]);if(scene.rooms.some(r=>leaves.includes(r.id)))ask('删除所选对象','将删除选中的房间、关联墙体和其他所选对象，可撤销恢复。',action);else action();}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function imageDownload(name,data){const a=document.createElement('a');a.href=data;a.download=name;a.click();}
function modal(title,body){$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function ask(title,text,action){modal(title,`<p>${text}</p><div class="modal-actions"><button id="cancel-action">取消</button><button id="confirm-action" class="primary">确认</button></div>`);$('#cancel-action').onclick=closeModal;$('#confirm-action').onclick=()=>{action();closeModal();};}
function quickRoom(){modal('按尺寸创建房间',`<p class="muted">输入墙体中心线围成的尺寸，创建地面和四面墙。净尺寸需扣除两侧半墙厚。</p><form id="room-form"><div class="field-grid">${input('名称','new-name','新房间','text')}${input('宽度 cm','new-width',500,'number','min="20" max="5000" required')}${input('深度 cm','new-depth',400,'number','min="20" max="5000" required')}${input('层高 cm','new-height',280,'number','min="10" max="2000" required')}${input('起点 X','new-x',0)}${input('起点 Y','new-y',0)}${input('墙厚 cm','new-thickness',12,'number','min="1" max="100" required')}</div><button type="submit" class="primary">创建房间</button></form>`);$('#room-form').onsubmit=e=>{e.preventDefault();const val=k=>$(`[data-field="new-${k}"]`).value;execute([{op:'room.rectangle',data:{name:val('name'),width:+val('width'),depth:+val('depth'),height:+val('height'),x:+val('x'),y:+val('y'),thickness:+val('thickness')}}]);closeModal();plan.fit();view3d.fit();};}
function addFurniture(index){const p=presets[index],b=sceneBounds(scene);const {symbol,...data}=p;execute([{op:'furniture.add',data:{...data,x:round(b.x+b.width/2),y:round(b.y+b.height/2)}}]);setTool('select');}
function history(direction){if(plan.drag)plan.cancel();const source=direction==='undo'?undo:redo,target=direction==='undo'?redo:undo;if(!source.length)return;target.push(clone(scene));scene=source.pop();selected=null;selectedIds=[];changed();}
function updateField(el){
  if(el.dataset.field.startsWith('selection.')){const b=selectionBounds(scene,selectedIds),k=el.dataset.field.split('.')[1],v=Number(el.value);try{transformSelected(k==='rotation'?{rotation:v}:k==='x'?{dx:v-b.cx}:{dy:v-b.cy});}catch{renderInspector();}return;}
  if(el.closest('#modal'))return;const found=locate(scene,selected);if(!found)return;const o=found.object,key=el.dataset.field,value=el.type==='number'?Number(el.value):el.value;let patch={};
  if(key==='shape'){patch={shape:value||null};if(value==='polygon')patch=furniturePolygonPatch(o,furnitureLocalPolygon({...o,shape:'rectangle'}));}
  else if(key.startsWith('vertex.')){const [,index,prop]=key.split('.'),ps=furnitureLocalPolygon(o);ps[+index][prop]=value;try{patch=furniturePolygonPatch(o,ps);}catch(error){toast(error.message);renderInspector();return;}}
  else if(key==='wallLength'){const len=distance(o.a,o.b);patch.b={x:o.a.x+(o.b.x-o.a.x)*value/len,y:o.a.y+(o.b.y-o.a.y)*value/len};}
  else if(key.startsWith('opening.')){const [,id,prop]=key.split('.');patch.openings=o.openings.map(v=>v.id===id?{...v,[prop]:value}:v);}
  else if(key.startsWith('point.')){const [,index,prop]=key.split('.');patch.points=o.points.map((v,i)=>i===+index?{...v,[prop]:value}:v);}
  else if(key.includes('.')){const [parent,prop]=key.split('.');patch[parent]={...o[parent],[prop]:value};}else patch[key]=value;
  try{execute([{op:'object.update',id:selected,patch}]);}catch{renderInspector();}
}
function addOpening(type){const w=locate(scene,selected)?.object;if(!w?.a)return;const width=Math.min(type==='door'?90:120,wallLength(w));let offset=10;for(const o of [...w.openings].sort((a,b)=>a.offset-b.offset)){if(offset+width<=o.offset)break;offset=o.offset+o.width+10;}if(offset+width>wallLength(w)){toast('这面墙没有足够空间，可先调整现有门窗');return;}const sill=type==='door'?0:Math.min(90,w.height*.25),height=Math.min(type==='door'?210:120,w.height-sill);execute([{op:'object.update',id:w.id,patch:{openings:[...w.openings,{id:uid(type),type,offset,width,height,sill}]}}]);}
function exportModal(){modal('导出方案',`<p class="muted">JSON 可重新编辑或交给 AI；SVG 保留二维矢量尺寸标注。</p><div class="export-options"><button data-export="json"><b>JSON 项目</b><span>全部对象、尺寸和门窗数据</span></button><button data-export="svg"><b>SVG 平面图</b><span>矢量图，可在浏览器中打印</span></button><button data-export="png"><b>PNG 三维图</b><span>保存当前 3D 视角</span></button></div>`);}
function warningsModal(){modal('空间检查',`<p class="muted">检查实际家具轮廓的重叠、越界、穿墙和层高。支持凹多边形，椭圆采用 64 段近似，不包含人体通行或开门规范。</p>${analysis.warnings.map(w=>`<button class="warning-item" data-warning-select="${w.ids[0]}">△ ${esc(w.message)} <span>定位 →</span></button>`).join('')||'<div class="empty-check">✓ 未发现摆放冲突</div>'}`);}
function aiModal(){
  const example={commands:[{op:'furniture.add',data:{id:'ai_desk',name:'AI 添加的书桌',kind:'table',x:300,y:220,width:140,depth:70,height:75,color:'#bda987'}}]};
  modal('AI 工作台',`<div class="ai-intro"><span class="api-tag">LOCAL API</span><p>AI 可读取完整场景，并通过原子命令批量操作。每个对象有稳定 ID，修改会同步到画布。</p></div><div class="api-links"><button id="copy-scene">复制当前场景</button><button id="copy-schema">复制命令 Schema</button><a href="/api/tools" target="_blank" rel="noopener">查看工具定义 ↗</a></div><label class="field"><span>JSON 命令批次</span><textarea id="ai-commands" spellcheck="false" rows="12">${esc(JSON.stringify(example,null,2))}</textarea></label><div class="button-pair"><button id="ai-validate">验证 / 预览</button><button id="ai-execute" class="primary">执行命令</button></div><pre id="ai-result" class="api-result">支持新增、修改、删除、复制、整场景导入，以及曲线墙和门窗属性。</pre><details><summary>HTTP 接入方式</summary><pre>GET  /api/project\nGET  /api/analysis\nGET  /api/schema\nGET  /api/tools\nPOST /api/commands\nGET  /api/measure?ax=0&amp;ay=0&amp;bx=100&amp;by=100</pre><p class="muted">写入需 Content-Type: application/json 和 expectedRevision。服务仅监听 127.0.0.1。静态部署下可使用 window.roomview 接口。</p></details>`);
  $('#copy-scene').onclick=()=>copy(JSON.stringify(scene,null,2));$('#copy-schema').onclick=()=>copy(JSON.stringify(commandSchema,null,2));
  const run=dry=>{try{const raw=JSON.parse($('#ai-commands').value),commands=Array.isArray(raw)?raw:raw.commands;const result=dry?applyCommands(scene,commands):execute(commands);$('#ai-result').textContent=JSON.stringify({dryRun:dry,results:result.results,warnings:analyze(result.scene).warnings},null,2);}catch(e){$('#ai-result').textContent='错误：'+e.message;}};
  $('#ai-validate').onclick=()=>run(true);$('#ai-execute').onclick=()=>run(false);
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制');}catch{toast('无法访问剪贴板，请使用 JSON 导出');}}
function helpModal(){modal('操作指南',`<div class="help-content"><p><b>画房间</b>：矩形工具拖拽创建；多边形工具逐点点击，Enter 闭合。房间尺寸以墙中心线为基准。</p><p><b>画曲线</b>：依次指定起点、终点、控制点。选择曲线后拖动白色控制柄，或在属性中输入坐标。</p><p><b>测量</b>：在画布直接点击起点与终点创建尺寸标注，优先吸附墙端点、房间顶点和家具角点。Alt 自由选点。</p><p><b>3D</b>：拖动旋转、右键平移、滚轮缩放。默认保留完整墙高，靠近视线的墙体自动变为透明轮廓；可切换完整实体墙、全部透明轮廓或隐藏墙体。窗户以蓝色窗框和透明玻璃表示。</p><p><b>快捷键</b>：V 选择，H 平移，W 直墙，C 曲线，M 测距，R 旋转，Delete 删除，Ctrl+点击多选，Ctrl+G 组合，Ctrl+Shift+G 取消组合，Ctrl+D 复制，Ctrl+Z 撤销，Ctrl+Shift+Z 重做。空格临时平移，Alt 临时关闭吸附。</p><p><b>本地保存</b>：用 npm run dev / npm start 时保存到 data/project.json。浏览器也保留备份；建议定期导出 JSON。</p><p><b>坐标约定</b>：cm；X 向右、Y 在平面向下；家具位置是中心点，旋转为顺时针；高度与离地高度分别编辑。</p></div>`);}
function conflictModal(){modal('处理同步冲突',`<p>服务器布局已被 AI 或其他页面修改。当前编辑仍保存在浏览器中。</p><div class="export-options"><button id="conflict-export"><b>先导出当前方案</b><span>保存本页面的 JSON 备份</span></button><button id="conflict-load"><b>使用服务器版本</b><span>替换当前页面，继续编辑最新布局</span></button><button id="conflict-save"><b>以当前页面覆盖服务器</b><span>重新获取版本后保存当前布局</span></button></div>`);$('#conflict-export').onclick=()=>download('RoomView-conflict-backup.json',JSON.stringify(scene,null,2),'application/json');$('#conflict-load').onclick=async()=>{const r=await fetch('/api/project'),d=await r.json();scene=validateScene(d.scene);revision=d.revision;dirty=false;conflicted=false;undo=[];redo=[];storeLocal();renderAll();closeModal();};$('#conflict-save').onclick=async()=>{const r=await fetch('/api/project'),d=await r.json();revision=d.revision;conflicted=false;online=true;closeModal();await save();};}

document.addEventListener('change',e=>{
  const el=e.target;if(el.matches('[data-field]')){updateField(el);return;}
  if(el.id==='project-name')execute([{op:'scene.rename',name:el.value}]);
  if(el.id==='snap')plan.snap=el.checked;
  if(el.id==='grid'){plan.grid=+el.value;plan.render();}
  if(el.id==='dimensions'){plan.dimensions=el.checked;plan.render();}
  if(el.id==='wall-mode')view3d.setMode(el.value);
  if(el.id==='lock-object')execute([{op:'object.update',id:selected,patch:{locked:el.checked}}]);
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.dataset.vertexInsert!==undefined||b.dataset.vertexRemove!==undefined){const f=locate(scene,selected)?.object;if(!f||f.shape!=='polygon')return;const ps=furnitureLocalPolygon(f);if(b.dataset.vertexInsert!==undefined){const i=+b.dataset.vertexInsert,a=ps[i],c=ps[(i+1)%ps.length];ps.splice(i+1,0,{x:(a.x+c.x)/2,y:(a.y+c.y)/2});}else ps.splice(+b.dataset.vertexRemove,1);execute([{op:'object.update',id:f.id,patch:furniturePolygonPatch(f,ps)}]);return;}
    if(b.dataset.tool){setTool(b.dataset.tool);return;}
    if(b.dataset.preset){addFurniture(+b.dataset.preset);return;}
    if(b.dataset.tab){document.querySelectorAll('[data-tab]').forEach(v=>v.classList.toggle('active',v===b));$('#library-tab').hidden=b.dataset.tab!=='library';$('#objects-tab').hidden=b.dataset.tab!=='objects';return;}
    if(b.dataset.select){select(b.dataset.select,{toggle:e.ctrlKey||e.metaKey});return;}
    if(b.dataset.warningSelect){select(b.dataset.warningSelect);closeModal();return;}
    if(b.dataset.view){$('#views').className='view-workspace '+(b.dataset.view==='split'?'split':b.dataset.view==='2d'?'only-2d':'only-3d');document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('active',v===b));setTimeout(()=>{plan.fit();view3d.resize();},0);return;}
    if(b.dataset.removeOpening){const w=locate(scene,selected).object;execute([{op:'object.update',id:selected,patch:{openings:w.openings.filter(o=>o.id!==b.dataset.removeOpening)}}]);return;}
    if(b.dataset.export){if(b.dataset.export==='json')download(`${scene.name}.json`,JSON.stringify(scene,null,2),'application/json');if(b.dataset.export==='svg')download(`${scene.name}.svg`,plan.exportSvg(),'image/svg+xml');if(b.dataset.export==='png'){const data=view3d.screenshot();if(data)imageDownload(`${scene.name}-3D.png`,data);else toast('3D 未启用');}return;}
    switch(b.id){
      case 'undo':history('undo');break;case 'redo':history('redo');break;
      case 'draw-furniture':if($('#views').classList.contains('only-3d'))document.querySelector('[data-view="2d"]').click();setTool('furniture');break;
      case 'shape-circle':{const f=locate(scene,selected).object;execute([{op:'object.update',id:f.id,patch:{shape:'ellipse',depth:f.width}}]);break;}
      case 'shape-l':execute([{op:'object.update',id:selected,patch:{shape:'polygon',vertices:presets[10].vertices}}]);break;
      case 'new-scene':ask('新建空白方案','当前方案可通过撤销恢复；建议先导出备份。',()=>{execute([{op:'scene.load',scene:emptyScene()}]);selected=null;renderAll();});break;
      case 'quick-room':quickRoom();break;
      case 'demo-load':ask('载入示例','这会替换当前方案，可撤销恢复。',()=>{execute([{op:'scene.load',scene:demoScene()}]);plan.fit();view3d.fit();});break;
      case 'delete-object':deleteSelected();break;
      case 'duplicate-object':duplicateSelected();break;
      case 'rotate-object':transformSelected({rotation:90});break;
      case 'group-selection':groupSelection();break;case 'ungroup-selection':ungroupSelection();break;
      case 'toggle-curve':{const w=locate(scene,selected).object;const patch={control:w.control?null:{x:(w.a.x+w.b.x)/2-(w.b.y-w.a.y)*.2,y:(w.a.y+w.b.y)/2+(w.b.x-w.a.x)*.2}};execute([{op:'object.update',id:selected,patch}]);break;}
      case 'add-door':addOpening('door');break;case 'add-window':addOpening('window');break;
      case 'room-height-walls':{const r=locate(scene,selected).object,commands=scene.walls.filter(w=>w.roomId===r.id).map(w=>({op:'object.update',id:w.id,patch:{height:r.height}}));if(commands.length)execute(commands);break;}
      case 'rebuild-walls':{const r=clone(locate(scene,selected).object);ask('重建轮廓墙体','关联墙体将被替换，已有门窗开口会移除，可撤销恢复。',()=>execute([...scene.walls.filter(w=>w.roomId===r.id).map(w=>({op:'object.delete',id:w.id})),...r.points.map((a,i)=>({op:'wall.add',data:{a,b:r.points[(i+1)%r.points.length],height:r.height,roomId:r.id,name:`${r.name} · 墙 ${i+1}`}}))]));break;}
      case 'fit-plan':plan.fit();break;case 'zoom-in':plan.zoom(1/1.2);break;case 'zoom-out':plan.zoom(1.2);break;
      case 'fit-three':case 'orbit-view':view3d.fit();$('#orbit-view').classList.add('active');$('#top-view').classList.remove('active');break;
      case 'top-view':view3d.fit(true);$('#top-view').classList.add('active');$('#orbit-view').classList.remove('active');break;
      case 'export':exportModal();break;case 'import':$('#file-input').click();break;case 'ai-open':aiModal();break;case 'help-open':helpModal();break;
      case 'warnings-open':warningsModal();break;case 'point-measure':setTool('measure');toast('在画布点击起点和终点，Alt 可自由选点');break;case 'modal-close':closeModal();break;
    }
  }catch(error){toast(error.message);}
});
$('#save-status').onclick=()=>{if(conflicted)conflictModal();};
$('#object-search').oninput=renderObjects;
$('#file-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('JSON 文件不能大于 2 MB');const raw=JSON.parse(await f.text()),loaded=validateScene(raw.scene||raw);ask('导入方案','导入将替换当前布局，可撤销恢复。',()=>{execute([{op:'scene.load',scene:loaded}]);plan.fit();view3d.fit();});}catch(error){toast(error.message);}e.target.value='';};
window.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||$('#modal').open)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();toast('已保留本地备份');return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'){e.preventDefault();if(e.shiftKey)ungroupSelection();else groupSelection();return;}
  if(e.ctrlKey||e.metaKey)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();$('#delete-object')?.click();return;}
  if(e.key.toLowerCase()==='r'){$('#rotate-object')?.click();return;}
  const keys={v:'select',h:'pan',w:'wall',c:'curve',m:'measure'};if(keys[e.key.toLowerCase()])setTool(keys[e.key.toLowerCase()]);
  const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(arrows[e.key]&&selectedIds.length){e.preventDefault();const [x,y]=arrows[e.key],step=e.shiftKey?10:1;try{transformSelected({dx:x*step,dy:y*step});}catch{}}
});
window.roomview=Object.freeze({getScene:()=>clone(scene),getSelection:()=>[...selectedIds],getAnalysis:()=>clone(analyze(scene)),getSchema:()=>clone(commandSchema),getTools:()=>clone(toolsDefinition),getRevision:()=>revision,apply:commands=>execute(commands),dryRun:commands=>applyCommands(scene,commands),measure:measurePoints,select,exportSVG:()=>plan.exportSvg(),save});
window.addEventListener('beforeunload',e=>{if(dirty&&online){e.preventDefault();e.returnValue='';}});
await init();
