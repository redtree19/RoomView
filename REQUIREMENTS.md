# 环境与依赖

RoomView 使用 JavaScript / Node.js，不依赖 Python，因此不使用 Python 的 `requirements.txt`。机器可读依赖清单是 [package.json](package.json)，精确版本由 [package-lock.json](package-lock.json) 固定。

## 运行环境

| 项目 | 要求 |
| --- | --- |
| Node.js | 22.12.0 或更高版本，建议使用受支持的 LTS 版本 |
| npm | 使用随 Node.js 安装的 npm |
| 系统 | Windows、macOS 或 Linux |
| 浏览器 | 支持 ES Modules、SVG、Pointer Events 和 WebGL 2 的现代浏览器 |
| 图形支持 | 3D 需要 WebGL 2；启用浏览器硬件加速。无法启用时仍可编辑 2D |
| 本地端口 | 默认 `127.0.0.1:4317`；可通过 `PORT` 修改 |

不需要数据库、Python、模型 API Key 或在线模型服务。依赖安装需要访问 npm 包源；安装和构建完成后，应用资源由本地提供。

## 项目依赖

| 包 | 声明范围 | 用途 |
| --- | --- | --- |
| `three` | `^0.180.0` | 3D 几何与渲染 |
| `vite` | `^7.1.0` | 开发服务器和静态资源构建（开发依赖） |
| `playwright` | `^1.55.0` | 浏览器交互测试（开发依赖） |

安装项目锁定的版本：

```sh
npm ci
```

## 可选：浏览器测试环境

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

测试会优先使用 Windows 默认安装位置的 Chrome 或 Edge，否则使用 Playwright Chromium。Linux 如缺少浏览器系统库，可运行 `npx playwright install --with-deps chromium`。正常使用 RoomView 不要求安装测试浏览器。

测试使用独立临时数据目录；API 测试使用端口 `14319`，浏览器测试使用 `14318`。不要同时在这些端口运行多个测试实例。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `4317` | RoomView 本地服务端口 |
| `ROOMVIEW_DATA_DIR` | 项目下的 `data/` | 自动保存目录 |
| `ROOMVIEW_URL` | `http://127.0.0.1:4317` | CLI / MCP 连接的服务地址 |

自定义环境变量通过系统终端传入；项目不会自动加载 `.env` 文件。服务没有公网账户鉴权，应在本机或另行配置访问控制的可信环境中运行。
