# GM Notes 图片上传与图库功能设计

日期：2026-08-05
状态：已与用户确认

## 背景

GM Notes 是一个基于 GitHub Contents API 的单文件 React 应用。笔记以 `.md` 文件
存储于用户的 GitHub 仓库。当前不支持在笔记中插入图片。

用户需求：
1. 笔记编写时能插入已上传的图片
2. 提供图片上传、管理与浏览页面

## 核心结论

GitHub REST API **支持图片上传**——通过 Contents API 的
`PUT /repos/{owner}/{repo}/contents/{path}`，将图片 base64 编码后创建文件。
上限 100MB/文件，认证请求 5000 次/小时。与现有 `saveNoteFile` 逻辑一致。

## 已确认的设计决策

| 决策点 | 结论 |
|--------|------|
| 仓库可见性 | **私有仓库**（方案 B：API 拉取 + Blob URL） |
| 图片存储位置 | **全局单一 `images/` 目录**（仓库根下） |
| 笔记中的引用格式 | **完整 raw URL**（`https://raw.githubusercontent.com/...`） |
| 管理界面形态 | **编辑器内图库抽屉**（类似 AI 抽屉） |
| 压缩策略 | **默认自动压缩 + 可选原图**（canvas 压缩，最长边 2048px、JPEG/WebP 质量 0.8） |

## 架构

### 存储

- 图片统一存放于仓库根目录 `images/` 下
- 文件名：`{timestamp}_{slug}` + 原始扩展名，如 `20260805_143022_screenshot.png`，
  避免重名冲突
- 上传成功后返回完整 raw URL 供插入笔记

### 渲染（方案 B：API 拉取 + Blob URL）

- 笔记内引用 `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/images/xxx.png`
- 预览渲染时，`PreviewPane` 在 HTML 注入后扫描 `<img>` 标签：
  - 匹配 `raw.githubusercontent.com/{owner}/{repo}/` 前缀的 src
  - 用 token 经 Contents API 下载图片（`GET /contents/images/xxx.png`，media 类型返回 base64）
  - 转为 Blob URL 并替换 src
  - 以 URL 为 key 缓存 Blob，避免重复请求
  - 组件卸载时 revoke Blob URL

### 图库抽屉

编辑器工具栏新增「🖼」按钮 → 打开图库抽屉：

- **上传区**：文件选择（多选）+ 压缩开关
  - 压缩：canvas 缩放 + 转 JPEG/WebP，base64 PUT 上传
  - 原图：直接 base64 PUT（GIF/SVG 等 canvas 不支持的格式强制原图）
- **列表区**：`GET /contents/images` 列出全部图片，缩略图网格
  - 私库缩略图同样走 API 拉取 Blob URL（懒加载）
  - 每项显示文件名、大小、上传时间
- **操作**：点击缩略图 → 插入 `![alt](raw_url)` 到光标处；
  复制 URL；删除（需 sha，先 GET 再 DELETE）

## 组件与文件

新增：
- `src/lib/imageApi.js` — 图片列表/上传/删除/下载
- `src/lib/imageCompression.js` — canvas 压缩
- `src/contexts/ImageContext.jsx` — 图库状态管理（列表、上传、删除、抽屉开关）
- `src/components/images/ImageGalleryDrawer.jsx` — 图库抽屉 UI
- `src/styles/image-gallery.css` — 样式
- i18n 键（zh.js / en.js）

修改：
- `src/components/PreviewPane.jsx` — Blob URL 替换逻辑
- `src/components/EditorPane.jsx` — 新增图片按钮
- `src/hooks/useMarkdownRenderer.js` — 不改（保持纯同步渲染，由 PreviewPane 做二次处理）
- `src/App.jsx` — 挂载 ImageProvider + Drawer
- `src/main.jsx` — 引入新样式
- `src/contexts/NotesContext.jsx` — 暴露 `insertImage(markdown)` 复用 insertContent 光标逻辑

## 错误处理

- 目录不存在（首次上传前 `GET /contents/images` 返回 404）→ 视为空列表，上传时自动创建
- 上传失败（速率限制/认证）→ toast 错误提示
- 删除确认 → 二次确认后执行
- Blob 拉取失败 → 显示占位图标 + alt 文本

## 测试

- `npm run dev` 手动验证：
  - 上传压缩图/原图 → 图库出现缩略图
  - 点击插入 → 编辑器光标处出现 markdown 引用
  - 预览模式图片正常显示（私库验证 Blob URL 路径）
  - 删除图片 → 列表移除
  - 目录切换（life/work）后图片仍全局可见
