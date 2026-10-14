# RoomView AI 操作接口

默认 `http://127.0.0.1:4317`，先运行 `npm run dev` 或 `npm start`。服务只监听本机，不提供公网鉴权；不应反向代理到不受信任的网络。

## 工作顺序

1. `GET /api/project` 获得 `{ revision, scene }`，读取对象 ID。
2. `GET /api/schema` 获取完整命令 JSON Schema；`GET /api/tools` 获取 Function Calling 工具定义。
3. `POST /api/commands`，传入 `expectedRevision`、`commands`，可先 `dryRun:true` 验证。
4. `GET /api/analysis` 检查改动后的重叠、墙边净距、越界、层高。

浏览器约每 1.7 秒拉取版本。浏览器未保存的本地编辑与 AI 改动冲突时，页面保留备份并要求选择版本，不自动覆盖。

写请求必须使用 `Content-Type: application/json`。版本过期返回 **409**；未提供版本返回 **428**；数据校验失败返回 **400**。一个批次最多 100 条命令，任何一条失败都不写入；dry-run 返回预览场景与分析但不更新 revision。

## 例子

```python
import json
from urllib.request import Request, urlopen

base = 'http://127.0.0.1:4317'
project = json.load(urlopen(base + '/api/project'))
body = {
    'expectedRevision': project['revision'],
    'dryRun': False,
    'commands': [
        {'op': 'object.update', 'id': 'desk_1',
         'patch': {'width': 150, 'depth': 70, 'height': 76}},
        {'op': 'wall.add', 'data': {
            'id': 'curved_partition', 'name': '弧形隔断',
            'a': {'x': 50, 'y': 220}, 'b': {'x': 250, 'y': 220},
            'control': {'x': 150, 'y': 290},
            'height': 220, 'thickness': 10
        }}
    ]
}
req = Request(base + '/api/commands',
              data=json.dumps(body).encode(),
              headers={'Content-Type': 'application/json'}, method='POST')
print(json.load(urlopen(req)))
```

先读取真实 ID；示例 ID 只存在于初始演示场景。家具 x/y 是中心点，所有尺寸均为 cm，rotation 顺时针。

## 命令

| op | 参数 | 作用 |
|---|---|---|
| `room.rectangle` | `data:{x,y,width,depth,height,thickness,name,withWalls}` | 创建矩形地面与可选关联墙；返回 room ID 与 wall IDs |
| `room.add` | `data:{points:[{x,y},...],height,color,name,id?}` | 创建多边形地面；不自动添加墙 |
| `wall.add` | `data:{a,b,control?,height,thickness,openings?,roomId?,id?,name?}` | 添加直墙或二次贝塞尔曲线墙 |
| `furniture.add` | `data:{kind,name,x,y,width,depth,height,elevation,rotation,color,id?}` | 添加家具；可省略默认属性 |
| `measurement.add` | `data:{name,a,b,id?}` | 添加两点标注 |
| `object.update` | `id,patch` | 部分字段更新；嵌套数组整体替换；不能修改 ID |
| `object.delete` | `id` | 删除对象；删房间同时删关联墙，保留家具 |
| `object.duplicate` | `id` | 复制家具，向右下偏移 30 cm，生成新 ID |
| `scene.rename` | `name` | 改名 |
| `scene.load` | `scene` | 校验并替换完整场景 |
| `group.create` | `ids:[ID,...],id?,name?` | 至少两个对象或组合，创建嵌套组合；输入成员 ID 会提升到最外层组合 |
| `group.ungroup` | `id` | 取消一层组合，保留成员及其子组合 |
| `selection.transform` | `ids,dx?,dy?,rotation?,center?` | 整体平移/旋转；rotation 是增量，默认绕包围框中心；锁定家具阻止变换 |
| `selection.duplicate` | `ids` | 保留层级复制，生成新 ID，向右下偏移 30 cm |
| `selection.delete` | `ids` | 删除选区及组合成员；删除房间附带关联墙体 |

`scene.groups` 是 `{id,name,members:[ID,...]}` 数组；每个成员只能属于一个组合，支持嵌套、不允许循环。少于两个成员的组合在删除后自动解散。组内物体仍保留原始 ID，可通过 `object.update` 精确编辑。

`kind` 支持 `box, bed, sofa, table, chair, cabinet, rug, plant, round`。`locked` 用来防止鼠标和键盘误移动；AI 的显式更新仍可修改锁定对象。

### 自定义家具轮廓

`furniture.add.data` 和 `object.update.patch` 均支持 `shape`：`rectangle`（矩形）、`ellipse`（椭圆，width=depth 时为圆）、`polygon`（自定义多边形）；`shape:null` 恢复 kind 预设模型。自定义形状按 height 拉伸，elevation 为底部离地高度。

多边形需提供 `vertices:[{x,y},...]`，3～80 个顶点，按轮廓顺序排列，可为凹多边形，不允许自交、内孔或退化。**vertices 是包围框内 0～1 的归一化局部坐标**，两轴均须覆盖 0 和 1；实际局部坐标为 `((x-.5)*width, (y-.5)*depth)`，再按 rotation 旋转并平移到家具中心 x/y。修改宽深会同比例拉伸相应轴。

```json
{"op":"furniture.add","data":{"id":"l_desk","name":"L 形书桌","kind":"box","shape":"polygon","x":300,"y":220,"width":160,"depth":120,"height":75,"vertices":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":0.4},{"x":0.4,"y":0.4},{"x":0.4,"y":1},{"x":0,"y":1}]}}
```

UI 顶点输入采用厘米，自动换算并重算中心与宽深；API 直接使用上述归一化格式。分析采用实际轮廓，椭圆为 64 段近似。组合、复制、保存会保留完整轮廓。

墙体开口示例：

```json
{
  "id": "window_2", "type": "window",
  "offset": 100, "width": 120, "sill": 90, "height": 140
}
```

offset 从墙的 a 点沿墙曲线量起。开口必须完整位于墙内，同墙开口不能水平重叠。`control:null` 可将曲线转直墙。房间轮廓和墙体是独立对象，修改顶点不会自动改墙。

## 查询

- `GET /api/project`：场景、revision、存储异常信息。
- `GET /api/analysis`：面积、告警、家具所属房间、最近墙边距离、墙长。面积按多边形相加；碰撞按家具轮廓（椭圆为 64 段近似）。
- `GET /api/measure?ax=0&ay=0&bx=30&by=40`：两点直线距离 `distance`（示例为 50 cm）、`dx`、`dy` 和原始坐标。需要四个有限数字，不再接受家具 ID。
- `GET /api/tools`：可供模型使用的 OpenAI 风格 Function Calling 定义，调用方负责按工具描述映射到 HTTP。

## 浏览器接口

```javascript
window.roomview.getScene()
window.roomview.getAnalysis()
window.roomview.getSchema()
window.roomview.getTools()
window.roomview.getRevision()
window.roomview.dryRun([{op:'object.update',id:'desk_1',patch:{height:80}}])
window.roomview.apply([{op:'object.update',id:'desk_1',patch:{height:80}}])
window.roomview.measure({x:0,y:0},{x:30,y:40})
window.roomview.select('desk_1')
window.roomview.select('chair_1',{toggle:true})
window.roomview.getSelection()
window.roomview.apply([{op:'group.create',ids:['desk_1','chair_1'],name:'桌椅组合'}])
window.roomview.exportSVG()
await window.roomview.save()
```

`roomview:change` DOM 事件用于订阅本页编辑。浏览器 apply 支持撤销和自动保存。HTTP / MCP 写入由服务器版本化保存；浏览器收到外部改动后清空本页撤销历史，避免回滚他人的修改。

## MCP stdio

参考 `examples/mcp-config.json`。启动命令为 `node /absolute/path/to/RoomView/scripts/mcp-server.mjs`，不要用会往 stdout 打印启动提示的 npm 包装。桥接器只向 stdout 输出 JSON-RPC，错误信息放 stderr。

工具：`roomview_get_project`、`roomview_apply_commands`、`roomview_analyze`、`roomview_measure`。写入必须提供从读取工具取得的 `expectedRevision`。如更改 HTTP 端口，用 `ROOMVIEW_URL` 指定新地址。支持 MCP 2025-06-18 及列出的更早协议，不声明支持 2026 无会话协议。
