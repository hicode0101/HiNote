<div align="center">

# HiNote

**一款本地优先的 Markdown 笔记本 —— 极简、快速、纯本地存储**

基于 Tauri 2 + Vue 3 构建的轻量级桌面笔记应用，专注于 Markdown 写作体验。
所有笔记以纯文本形式保存在你自己的文件夹里，不依赖任何云服务，无数据库、无锁定。

[![Version](https://img.shields.io/badge/version-0.1.0-blue)]()
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-lightgrey)](https://github.com/hicode0101)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=black)](https://v2.tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)

</div>

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [工程目录结构](#工程目录结构)
- [快捷键](#快捷键)
- [常见问题](#常见问题)

## 功能特性

### 双模式编辑器

| 模式 | 说明 |
|------|------|
| **经典模式** | 基于 CodeMirror 6 的 Markdown 源码编辑，语法着色、编辑 / 预览双标签页 |
| **流畅模式** | 基于 Vditor 的所见即所得（WYSIWYG）编辑，带格式工具栏，写作体验接近传统文档软件 |

- 两种模式随时切换，内容实时同步
- Markdown 预览支持任务列表、表格、代码块高亮、HTML 内嵌

### 智能文件与编码处理

- **自动编码识别**：UTF-8 / UTF-8 BOM / UTF-16 LE/BE / GBK / GB18030 / ANSI 自动探测，保存时保持原编码不变（基于 `encoding_rs` + `chardetng`）
- **外部修改检测**：文件在磁盘上被其他程序修改时，自动弹窗询问是否重新加载
- **未保存保护**：面包屑文件名后的圆点标记未保存修改，切换 / 关闭文件时弹出 保存 / 不保存 确认框
- **自动保存开关**：设置中可开启自动保存（默认关闭）

### 工作区管理

- 文件树：新建 / 重命名 / 删除文档与文件夹、右键菜单、资源管理器中打开
- 外部文件系统变更自动刷新目录树（Rust 侧 FS Watcher）
- 最近打开的工作区记录
- 拖拽文件树中的文件到编辑器：图片插入 `![](相对路径)` 引用，其他文件插入链接
- **图片联动删除**：删除文档中的图片引用时（流畅模式删除图片 / 经典模式删除完整的图片标签），弹窗询问是否同时删除磁盘上的物理图片文件

### 链接与图片

- 笔记内相对路径链接可直接跳转到工作区内的其他文档
- 网页链接（`http(s)` / `mailto`）自动调用系统默认浏览器打开
- 粘贴截图自动保存到笔记旁的 `assets` 目录并插入引用
- 双击文档中的图片打开图片画廊预览（支持同一目录批量浏览）

### 查找与编辑增强

- **VS Code 风格的 Ctrl+F 搜索面板**：经典编辑模式支持查找替换；预览与流畅模式支持全文查找高亮（CSS Custom Highlight API），三种视图下位置一致（顶部居中）
- 20+ 种语言的语法高亮：JS/TS、Python、Java、C#、C/C++、Go、Rust、SQL、PHP、YAML、Shell、Batch、INI/TOML 等
- JSON / XML 格式化与压缩（快捷键 / 右键菜单）
- PDF 阅读（独立只读视图）
- 右键菜单：撤销 / 恢复、剪切 / 复制 / 粘贴、大小写转换（全部大写 / 小写 / 首字母大写）、重新加载文件；已禁用 WebView2 原生菜单，全程使用统一的自绘菜单

### 界面

- 自定义无边框标题栏，深色 / 浅色主题跟随切换
- 中文 / 英文双语界面
- 状态栏：行列号、字符数、编码、行尾符

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Tauri 2](https://v2.tauri.app/)（Rust 后端 + 系统 WebView） |
| 前端 | Vue 3.5 + TypeScript + Vite 7 |
| 编辑器 | CodeMirror 6（源码模式）、Vditor（所见即所得） |
| 预览渲染 | markdown-it + highlight.js |
| 编码检测 | encoding_rs + chardetng（Rust） |
| 文件监听 | notify（Rust FS Watcher） |
| PDF | pdfjs-dist |

## 快速开始

### 环境要求

- **Node.js** ≥ 20.19（推荐 LTS 版本）
- **Rust** ≥ 1.77（`rustup` 安装：<https://rustup.rs>）
- **Windows 10 及以上**（依赖系统自带的 WebView2 运行时；Win11 一般已内置，缺失时 Tauri 会自动引导安装）

### 开发运行

```bash
# 1. 克隆仓库
git clone https://github.com/hicode0101/HiNote.git
cd HiNote

# 2. 安装前端依赖（postinstall 会自动复制 Vditor 静态资源）
npm install

# 3. 启动开发模式（前端热更新 + Rust 增量编译）
npm run tauri dev
```

### 构建发布版本

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 下：

| 目录 | 内容 |
|------|------|
| `msi/` | Windows 安装包（`.msi`） |
| `nsis/` | NSIS 安装程序（`.exe`，如已启用） |
| `release/` | 免安装的单文件可执行程序 `HiNote.exe` |

> 构建前请确保网络可访问 crates.io 与 npm（首次构建需下载 Rust 依赖）。

### 基本使用

1. 启动 HiNote，打开（或新建）一个文件夹作为工作区 —— 它就是你所有笔记的存放位置
2. 左侧文件树中新建 Markdown 文档，或在资源管理器中把已有的 `.md` 文件夹拖进来
3. 顶部按钮切换 经典 / 流畅 编辑模式、编辑 / 预览视图
4. 所有笔记就是普通文件，可以用任何编辑器打开，也可以放进 Git 仓库做版本管理

## 工程目录结构

```
HiNote/
├── src/                        # 前端（Vue 3 + TypeScript）
│   ├── components/             # 界面组件
│   │   ├── EditorClassic.vue   #   经典模式（CodeMirror 6）编辑器
│   │   ├── EditorFluid.vue     #   流畅模式（Vditor WYSIWYG）编辑器
│   │   ├── PreviewPane.vue     #   Markdown 预览（markdown-it 渲染）
│   │   ├── EditorSearch.vue    #   VS Code 风格查找替换面板（经典编辑）
│   │   ├── PreviewSearch.vue   #   全文查找面板（预览 / 流畅，Highlight API）
│   │   ├── EditorHeader.vue    #   面包屑导航 / 模式切换 / 关闭文档
│   │   ├── FormatToolbar.vue   #   Markdown 格式工具栏
│   │   ├── Sidebar.vue         #   侧边栏（搜索 + 文件树）
│   │   ├── TreeNodeItem.vue    #   文件树节点（递归、拖拽）
│   │   ├── PdfViewer.vue       #   PDF 只读阅读器
│   │   ├── ImagePreview.vue    #   图片画廊预览
│   │   ├── ContextMenu.vue     #   统一右键菜单（编辑器 / 文件树）
│   │   ├── PromptDialog.vue    #   对话框（确认 / 输入，可拖拽标题栏）
│   │   ├── SettingsDialog.vue  #   设置
│   │   ├── AboutDialog.vue     #   关于
│   │   ├── StatusBar.vue       #   状态栏
│   │   └── TitleBar.vue        #   自定义标题栏
│   ├── stores/                 # 响应式状态（Vue reactive 单例）
│   │   ├── editor.ts           #   当前文档：内容 / 编码 / 脏标记 / 保存 / 外部修改检测
│   │   ├── workspace.ts        #   工作区：文件树 / 打开文件 / 图片删除联动
│   │   ├── settings.ts         #   设置持久化（主题 / 模式 / 自动保存…）
│   │   ├── ui.ts               #   菜单 / 对话框 / Toast 开关
│   │   ├── dialog.ts           #   全局确认 / 输入对话框
│   │   └── imgpreview.ts       #   图片画廊状态
│   ├── lib/                    # 与 Vue 组件解耦的工具层
│   │   ├── tauri.ts            #   后端 invoke 封装（类型安全 API）
│   │   ├── markdownActions.ts  #   编辑器动作：格式化 / 剪贴板 / 图片删除判定
│   │   ├── imgSrc.ts           #   图片路径相对 ↔ 绝对 ↔ asset URL 转换
│   │   ├── languages.ts        #   文件类型注册表（20+ 语言 / 图标 / 高亮）
│   │   ├── hljsAuto.ts         #   代码块语言自动探测高亮
│   │   ├── formatActions.ts    #   JSON / XML 格式化压缩
│   │   ├── i18n.ts             #   中英文案
│   │   ├── theme.ts            #   深浅主题
│   │   ├── dropRef.ts          #   文件树 → 编辑器拖拽数据协议
│   │   └── ops.ts              #   文档 / 文件夹增删改名
│   ├── styles/                 # 全局样式（设计令牌 / 主题变量）
│   ├── App.vue                 # 根组件（布局 / 全局事件 / 快捷键）
│   └── main.ts
│
├── src-tauri/                  # 后端（Rust）
│   ├── src/
│   │   ├── commands/           # Tauri 命令层
│   │   │   ├── fs_cmds.rs      #   文件读写 / 目录树 / 删除 / 重命名（含工作区边界校验）
│   │   │   ├── encoding.rs     #   编码探测与转码（HiEditor FR-6 移植）
│   │   │   ├── image_cmd.rs    #   粘贴图片落盘
│   │   │   ├── format_cmd.rs   #   （前端格式化的辅助命令）
│   │   │   └── system_cmds.rs  #   打开浏览器 / 版本号 / WebView2 菜单禁用
│   │   ├── watcher.rs          #   FS Watcher：工作区变更 / 打开文件外部修改
│   │   ├── recent.rs           #   最近工作区持久化
│   │   ├── config.rs           #   应用配置
│   │   └── lib.rs              #   命令注册 / 初始化
│   ├── tauri.conf.json         # 窗口 / 打包配置
│   └── Cargo.toml
│
├── public/
│   ├── locales/                # i18n 文案（zh-CN / en-US）
│   └── vditor/                 # Vditor 本地静态资源（离线 CDN）
│
├── scripts/                    # 构建辅助脚本
│   ├── copy-vditor.mjs         #   npm install 后复制 Vditor 资源
│   └── gen-icon.mjs            #   应用图标生成
│
└── package.json
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前文档 |
| `Ctrl+F` | 查找 / 替换（编辑模式）；全文查找（预览 / 流畅模式） |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 恢复 |
| `Ctrl+Shift+J` / `Ctrl+Alt+J` | JSON 格式化 / 压缩 |
| `Ctrl+Shift+L` / `Ctrl+Alt+L` | XML 格式化 / 压缩 |
| `Tab` / `Shift+Tab` | 缩进 / 反缩进 |

## 常见问题

**Q: 笔记数据存在哪里？会不会被锁定到某个私有格式？**
A: 全部是你工作区文件夹里的纯文本文件（`.md` / `.txt` / `.json` …），图片等附件保存在文档旁的 `assets` 目录。没有任何私有格式和云端依赖，随时可以用其他工具打开。

**Q: 打开 GBK 等旧编码文件会乱码吗？**
A: 不会。HiNote 会自动探测编码（UTF-8 / UTF-16 / GBK / GB18030 / ANSI），状态栏显示当前编码，保存时保持原编码不变。

**Q: 文件被其他程序修改了怎么办？**
A: HiNote 监听磁盘变更，检测到打开的文件被外部修改时会弹窗询问是否重新加载，避免覆盖他人改动。

**Q: 支持其他操作系统吗？**
A: 目前仅在 Windows 10+ 上开发和测试。Tauri 本身跨平台，理论上 macOS / Linux 可构建，但未经过验证。

---

<div align="center">

由 [hicode0101](https://github.com/hicode0101) 开发维护 · 欢迎提 Issue 与 PR

</div>
