# dsh-snap · 截图并插入

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的截图插件：**点一下输入框旁边的剪刀，框选，图直接进附件。**

DeepSeek Harness 原本只能拖拽或选文件才能附图。`dsh-snap` 在输入框工具栏（`conversation.composer.dock`）加了一个按钮，点它立刻进入截屏框选，松手后截图自动变成输入框里的附件，不用再「截图 → 保存 → 找文件 → 拖进来」。

## 特性

- **就地截图**：按钮就在输入框工具栏里，和添加附件的位置并排
- **像 QQ / 微信截图一样的框选**：全屏压暗、拖动选区、实时显示 `宽 × 高`
- **自动附图**：框选结束直接把 PNG 塞进输入框附件，立刻可见缩略图
- **不依赖浏览器截屏权限**：走本地 Win32 截屏，不受 `getDisplayMedia` 的系统弹窗限制
- **DPI 感知**：高缩放（150% / 200%）显示器上也能截全屏、坐标不偏
- **零 npm 依赖**：插件本体除 Node 内置模块外无第三方依赖

## 环境要求

- Windows 10 / 11
- DeepSeek Harness 桌面端（web profile，本插件走 `webServer` 路由）
- .NET 8 Desktop Runtime（截图程序是 WinForms 单文件 exe）

## 安装

### 方式一：从 GitHub 装（推荐）

```bash
dsh plugin --profile <你的 profile> add git+https://github.com/12138hao/dsh-snap.git
```

> 桌面端 profile 由 Electron 独占管理时，命令可能被拒绝。此时把包目录放进
> `<profile>/node_modules/dsh-snap`，并在 `<profile>/package.json` 的
> `dsh.profile.bundles` 里加上 `"dsh-snap"`（写文件时注意别带 BOM，否则宿主读不了）。

### 方式二：本地目录

1. 克隆本仓库到任意固定位置
2. 按上面的说明放进 profile 的 `node_modules` 并登记 bundle
3. **重启** DSH（宿主已加载的模块不会热替换）
4. 刷新页面（F5）

## 使用

1. 在输入框工具栏找到剪刀图标
2. 点一下 → 屏幕冻结并压暗
3. 按住左键拖出一块区域，松手
4. 截图自动进入输入框附件区

按 `Esc` 取消本次截图。

## 工作原理

```
[页面] 剪刀按钮
   │ POST /api/dsh-snap/start
   ▼
[宿主插件] 拉起 bin/DshSnap.exe
   │ 冻结屏幕 → 框选 → 存 PNG 到 ~/.dsh/snap/snap.png
   │ 同时写 result.json
   ▼
[页面] 轮询 /api/dsh-snap/poll → ready
   │ GET /api/dsh-snap/file 取图
   ▼
[页面] 构造带 File 的 DataTransfer，向 contenteditable 派发 drop 事件
   ▼
DSH 的 onDrop 收到文件 → 变成输入框附件
```

DSH 的输入框是 Lexical 的 `contenteditable`，附件走 `onDrop` 的 `dataTransfer.files`，所以插件用合成 drop 事件完成「插入」，效果等于你把截图拖进去。

## 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/dsh-snap/start` | 清掉上次结果并拉起截图程序 |
| GET | `/api/dsh-snap/poll` | 查询是否已截好 |
| GET | `/api/dsh-snap/file` | 返回 PNG 本身 |
| POST | `/api/dsh-snap/done` | 兼容旧版截图程序的回调 |

## 配置

| 环境变量 | 说明 |
|---|---|
| `DSH_SNAP_EXE` | 覆盖截图程序路径，默认用包内 `bin/DshSnap.exe` |

截图临时文件固定写到 `~/.dsh/snap/`（`snap.png` / `result.json`）。

## 从源码构建截图程序

```bash
cd src
dotnet publish -c Release -r win-x64 -o ../bin
```

源码是单文件 `Program.cs`：冻结屏幕 → 自绘暗层与选区 → 保存 PNG → 写结果文件。
暗层是程序自己画的（不是窗体半透明），所以不会出现底层窗口文字透上来的虚影。

## 已知限制

- **仅 Windows**（依赖 Win32 截屏与 WinForms）
- 一次只截一张，没有贴纸、标注、马赛克等后处理
- 截图过程中屏幕是冻结画面，不是实时画面
- 多显示器场景下按虚拟桌面整屏截取

## English

A DeepSeek Harness plugin that puts a screenshot button in the chat composer:
click it, drag a region, and the image is attached to your message automatically.
It captures via a bundled Win32 helper (`bin/DshSnap.exe`) and injects the result
into the Lexical-based composer by dispatching a synthetic `drop` event with a
`File` in the `DataTransfer`. Windows only, MIT licensed.

## 许可证

MIT
