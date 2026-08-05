# 图片上传与图库功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 GM Notes 增加图片上传、图库管理与笔记内插入图片能力，图片经 GitHub Contents API 存于仓库根 `images/` 目录，私库预览走 Blob URL 方案。

**Architecture:** 新增 `imageApi.js`（列表/上传/删除/下载 + 默认分支获取）、`imageCompression.js`（canvas 压缩）、`ImageContext.jsx`（状态管理）、`ImageGalleryDrawer.jsx`（图库抽屉 UI）。`PreviewPane` 在 HTML 注入后扫描 `raw.githubusercontent.com/{owner}/{repo}/` 前缀的 `<img>`，用 token 经 API 拉取并替换为缓存 Blob URL。笔记内引用完整 raw URL，GitHub 网页端与本站预览均可渲染。

**Tech Stack:** React 18, Vite 5 (single-file), GitHub Contents API, marked。

**验证方式说明：** 本项目无测试框架，采用「`npm run build` 构建成功 + `npm run dev` 手动验证」作为每个任务的验收标准。每个任务提交一次。

---

## Task 1: 图片压缩工具 `src/lib/imageCompression.js`

**Files:**
- Create: `src/lib/imageCompression.js`

**Step 1: 创建文件**

```js
// 图片压缩工具：canvas 缩放 + 格式转换（浏览器端）
export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.8;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('压缩失败')), type, quality);
  });
}

// GIF/SVG 等不支持 canvas 处理的格式直接返回原图
function isCompressible(file) {
  const type = (file.type || '').toLowerCase();
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export function originalExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? m[1].toLowerCase() : 'png';
}

function pickOutputType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/png') return 'image/webp'; // PNG 转 WebP：保留透明且体积小
  if (type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function extForType(type) {
  return type === 'image/webp' ? 'webp' : 'jpg';
}

/**
 * 压缩图片。返回 { blob, ext }；不可压缩或压缩后更大时返回原图。
 * @param {File|Blob} file
 * @param {{maxEdge?:number, quality?:number}} options
 */
export async function compressImage(file, options = {}) {
  const maxEdge = options.maxEdge || MAX_EDGE;
  const quality = options.quality ?? JPEG_QUALITY;
  if (!isCompressible(file)) {
    return { blob: file, ext: originalExt(file) };
  }
  const img = await loadImage(file);
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  // 小图直接返回原图
  if (w <= maxEdge && h <= maxEdge && file.size < 300 * 1024) {
    return { blob: file, ext: originalExt(file) };
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);
  const outType = pickOutputType(file);
  let blob;
  try {
    blob = await canvasToBlob(canvas, outType, quality);
  } catch (e) {
    // WebP 不支持时回退 PNG
    blob = await canvasToBlob(canvas, 'image/png', 0.9);
  }
  // 压缩后仍大于原图则保留原图
  if (blob.size >= file.size) {
    return { blob: file, ext: originalExt(file) };
  }
  return { blob, ext: extForType(outType) };
}

/** Blob/File → base64（去掉 data URL 前缀） */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，生成 `dist/`。

**Step 3: 提交**

```bash
git add src/lib/imageCompression.js
git commit -m "feat: add image compression util"
```

---

## Task 2: 图片 API 封装 `src/lib/imageApi.js`

**Files:**
- Create: `src/lib/imageApi.js`（复用 `src/lib/githubApi.js` 的 `githubFetch`、`githubDelete`、`apiBase`）

**Step 1: 创建文件**

```js
// GitHub 图片 API 封装（基于 Contents API）
import { apiBase, githubFetch, githubDelete } from './githubApi';

export const IMAGE_DIR = 'images';

// 默认分支缓存：owner/repo -> branch
const branchCache = new Map();
// raw URL -> Blob URL 缓存（跨渲染复用）
const blobUrlCache = new Map();
// 进行中的下载：rawUrl -> Promise
const inflight = new Map();

function imagePath(name) {
  return IMAGE_DIR + '/' + name;
}

/** 获取仓库默认分支（构造 raw URL 用），带缓存 */
export async function getDefaultBranch(config) {
  const key = config.owner + '/' + config.repo;
  if (branchCache.has(key)) return branchCache.get(key);
  const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const branch = data.default_branch || 'main';
  branchCache.set(key, branch);
  return branch;
}

/** 构造图片 raw URL（需要默认分支） */
export async function getRawUrl(config, name) {
  const branch = await getDefaultBranch(config);
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${branch}/${imagePath(name)}`;
}

/** 列出 images/ 下全部文件；目录不存在返回空数组 */
export async function listImages(config) {
  try {
    const data = await githubFetch(config, apiBase(config) + '/' + IMAGE_DIR);
    const items = Array.isArray(data) ? data : [];
    return items
      .filter(f => f.type === 'file')
      .map(f => ({
        name: f.name,
        path: f.path,
        size: f.size,
        sha: f.sha
      }));
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return [];
    }
    throw e;
  }
}

/** 上传图片：base64 内容 PUT 到 images/{name} */
export async function uploadImage(config, name, base64) {
  const body = {
    message: 'Upload image via GMNotes',
    content: base64
  };
  return githubFetch(config, apiBase(config) + '/' + imagePath(name), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/** 删除图片：先 GET 拿 sha 再 DELETE */
export async function deleteImage(config, name) {
  const existing = await githubFetch(config, apiBase(config) + '/' + imagePath(name));
  return githubDelete(config, apiBase(config) + '/' + imagePath(name) + '?sha=' + existing.sha);
}

/** 带 token 下载图片为 Blob（私库预览用） */
export async function fetchImageBlob(config, path) {
  const res = await fetch(apiBase(config) + '/' + path, {
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3.raw'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** 从 raw URL 解析仓库内路径；非本仓库 URL 返回 null */
export function rawUrlToPath(config, rawUrl) {
  const prefix = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/`;
  if (!rawUrl || !rawUrl.startsWith(prefix)) return null;
  const rest = rawUrl.slice(prefix.length);
  const parts = rest.split('/');
  if (parts.length < 2) return null;
  return parts.slice(1).join('/'); // 去掉 branch 段
}

/** 获取 raw URL 对应的 Blob URL（缓存 + 去重） */
export function getBlobUrlForRaw(config, rawUrl) {
  if (blobUrlCache.has(rawUrl)) return Promise.resolve(blobUrlCache.get(rawUrl));
  if (inflight.has(rawUrl)) return inflight.get(rawUrl);
  const path = rawUrlToPath(config, rawUrl);
  if (!path) return Promise.resolve(null);
  const p = fetchImageBlob(config, path)
    .then(blob => {
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(rawUrl, url);
      return url;
    })
    .catch(err => {
      inflight.delete(rawUrl);
      throw err;
    });
  inflight.set(rawUrl, p);
  return p;
}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/lib/imageApi.js
git commit -m "feat: add image api wrapper"
```

---

## Task 3: 图库状态管理 `src/contexts/ImageContext.jsx`

**Files:**
- Create: `src/contexts/ImageContext.jsx`
- 依赖：`ToastContext`、`I18nContext`、`GitHubConfigContext`、`imageApi`、`imageCompression`

**Step 1: 创建文件**

```jsx
// ImageContext：图库状态管理
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { useGitHubConfig } from './GitHubConfigContext';
import * as imageApi from '../lib/imageApi';
import { compressImage, blobToBase64, originalExt } from '../lib/imageCompression';

const ImageContext = createContext(null);

function timestampName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function ImageProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { githubConfigRef, githubReady } = useGitHubConfig();

  const [showGallery, setShowGallery] = useState(false);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressEnabled, setCompressEnabled] = useState(true);

  const refreshImages = useCallback(async () => {
    if (!githubReady) return;
    const config = githubConfigRef.current;
    setLoading(true);
    try {
      const items = await imageApi.listImages(config);
      setImages(items);
    } catch (e) {
      showToast(t('gallery.toast.list_failed') + (e.message || ''), 'error');
      console.error('[listImages]', e);
    } finally {
      setLoading(false);
    }
  }, [githubReady, githubConfigRef, showToast, t]);

  const openGallery = useCallback(() => {
    setShowGallery(true);
    refreshImages();
  }, [refreshImages]);

  const closeGallery = useCallback(() => setShowGallery(false), []);

  const uploadFiles = useCallback(async (files) => {
    if (!githubReady || !files || !files.length) return;
    const config = githubConfigRef.current;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          let blob = file;
          let ext = originalExt(file);
          if (compressEnabled) {
            const r = await compressImage(file);
            blob = r.blob;
            ext = r.ext;
          }
          const base64 = await blobToBase64(blob);
          const name = timestampName() + '_' + ext;
          await imageApi.uploadImage(config, name, base64);
          ok++;
        } catch (e) {
          console.error('[uploadImage]', file.name, e);
          showToast(t('gallery.toast.upload_failed') + (file.name || '') + ' ' + (e.message || ''), 'error');
        }
      }
      if (ok > 0) {
        showToast(t('gallery.toast.uploaded') + ok, 'success');
        await refreshImages();
      }
    } finally {
      setUploading(false);
    }
  }, [githubReady, githubConfigRef, compressEnabled, refreshImages, showToast, t]);

  const deleteImage = useCallback(async (image) => {
    const config = githubConfigRef.current;
    try {
      await imageApi.deleteImage(config, image.name);
      setImages(prev => prev.filter(i => i.name !== image.name));
      showToast(t('gallery.toast.deleted'), 'info');
    } catch (e) {
      showToast(t('gallery.toast.delete_failed') + (e.message || ''), 'error');
      console.error('[deleteImage]', e);
    }
  }, [githubConfigRef, showToast, t]);

  const value = useMemo(() => ({
    showGallery, openGallery, closeGallery,
    images, loading, uploading,
    compressEnabled, setCompressEnabled,
    refreshImages, uploadFiles, deleteImage
  }), [showGallery, openGallery, closeGallery, images, loading, uploading,
      compressEnabled, refreshImages, uploadFiles, deleteImage]);

  return <ImageContext.Provider value={value}>{children}</ImageContext.Provider>;
}

export function useImages() {
  const ctx = useContext(ImageContext);
  if (!ctx) throw new Error('useImages must be used within ImageProvider');
  return ctx;
}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/contexts/ImageContext.jsx
git commit -m "feat: add image gallery context"
```

---

## Task 4: 图库抽屉 UI `src/components/images/ImageGalleryDrawer.jsx`

**Files:**
- Create: `src/components/images/ImageGalleryDrawer.jsx`
- 复用 `src/lib/imageApi.js` 的 `getRawUrl`、`getBlobUrlForRaw`
- 复用 `NotesContext.insertContent`（mode='cursor'）实现光标处插入

**Step 1: 创建文件**

```jsx
// 图库抽屉：上传、浏览、插入、删除
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useImages } from '../../contexts/ImageContext.jsx';
import { useNotes } from '../../contexts/NotesContext.jsx';
import { useGitHubConfig } from '../../contexts/GitHubConfigContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { getRawUrl, getBlobUrlForRaw } from '../../lib/imageApi';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// 懒加载缩略图（IntersectionObserver 进入视口才下载）
function LazyThumb({ image }) {
  const { t } = useI18n();
  const { githubConfigRef } = useGitHubConfig();
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        obs.disconnect();
      }
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const rawUrl = `https://raw.githubusercontent.com/${githubConfigRef.current.owner}/${githubConfigRef.current.repo}/HEAD/${image.path}`;
    getBlobUrlForRaw(githubConfigRef.current, rawUrl)
      .then(url => { if (url) setSrc(url); else setFailed(true); })
      .catch(() => setFailed(true));
  }, [visible, image.path, githubConfigRef]);

  return (
    <div ref={ref} className="gallery-thumb">
      {failed ? <span className="gallery-thumb-failed">⚠</span>
        : src ? <img src={src} alt={image.name} loading="lazy" />
        : <span className="gallery-thumb-loading" title={t('gallery.loading')}>…</span>}
    </div>
  );
}

function GalleryCard({ image }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { deleteImage, closeGallery } = useImages();
  const { insertContent } = useNotes();
  const { githubConfigRef } = useGitHubConfig();
  const [busy, setBusy] = useState(false);

  const resolveUrl = async () => getRawUrl(githubConfigRef.current, image.name);

  const handleInsert = async () => {
    setBusy(true);
    try {
      const url = await resolveUrl();
      insertContent(`![${image.name}](${url})`, 'cursor');
      closeGallery();
      showToast(t('gallery.toast.insert_done'), 'success');
    } catch (e) {
      showToast(t('gallery.toast.insert_failed') + (e.message || ''), 'error');
      console.error('[insertImage]', e);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      const url = await resolveUrl();
      await navigator.clipboard.writeText(url);
      showToast(t('gallery.toast.copy_done'), 'success');
    } catch (e) {
      showToast(t('gallery.toast.copy_failed') + (e.message || ''), 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('gallery.delete_confirm'))) return;
    await deleteImage(image);
  };

  return (
    <div className="gallery-card" title={image.name}>
      <button className="gallery-card-main" onClick={handleInsert} disabled={busy}>
        <LazyThumb image={image} />
        <span className="gallery-card-name">{image.name}</span>
        <span className="gallery-card-size">{formatBytes(image.size)}</span>
      </button>
      <div className="gallery-card-actions">
        <button onClick={handleCopy} title={t('gallery.copy')}>🔗</button>
        <button onClick={handleDelete} title={t('gallery.delete')}>🗑</button>
      </div>
    </div>
  );
}

export function ImageGalleryDrawer() {
  const { t } = useI18n();
  const {
    showGallery, closeGallery,
    images, loading, uploading,
    compressEnabled, setCompressEnabled,
    uploadFiles
  } = useImages();
  const fileInputRef = useRef(null);

  if (!showGallery) return null;

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length) uploadFiles(files);
    e.target.value = '';
  };

  return (
    <div className="gallery-overlay" onClick={closeGallery}>
      <div className="gallery-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="gallery-header">
          <h2>🖼 {t('gallery.title')}</h2>
          <button className="close-btn" onClick={closeGallery} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="gallery-body">
          <div className="gallery-upload">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFileChange}
            />
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={uploading}
            >
              {uploading ? t('gallery.uploading') : t('gallery.upload')}
            </button>
            <label className="gallery-compress">
              <input
                type="checkbox"
                checked={compressEnabled}
                onChange={(e) => setCompressEnabled(e.target.checked)}
              />
              {t('gallery.compress')}
            </label>
          </div>
          {loading ? (
            <div className="gallery-empty">{t('gallery.loading')}</div>
          ) : images.length === 0 ? (
            <div className="gallery-empty" dangerouslySetInnerHTML={{ __html: t('gallery.empty') }} />
          ) : (
            <div className="gallery-grid">
              {images.map(img => <GalleryCard key={img.name} image={img} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/components/images/ImageGalleryDrawer.jsx
git commit -m "feat: add image gallery drawer UI"
```

---

## Task 5: 预览区图片 Blob URL 替换 `src/components/PreviewPane.jsx`

**Files:**
- Modify: `src/components/PreviewPane.jsx`（整文件重写，仅 9 行旧文件）

**Step 1: 重写文件**

```jsx
// 预览：注入 HTML 后将仓库图片替换为 Blob URL（私库支持）
import { useEffect, useRef } from 'react';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { getBlobUrlForRaw } from '../lib/imageApi';

export function PreviewPane({ html }) {
  const { githubConfigRef, githubReady } = useGitHubConfig();
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('img').forEach((img) => {
      const rawUrl = img.getAttribute('src') || '';
      getBlobUrlForRaw(config, rawUrl)
        .then(url => {
          if (url && container.contains(img)) img.src = url;
        })
        .catch(() => { /* 非本仓库图片或拉取失败，保持原样 */ });
    });
  }, [html, githubReady, githubConfigRef]);

  return (
    <div
      ref={containerRef}
      className="preview-pane"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/components/PreviewPane.jsx
git commit -m "feat: render repo images via blob url in preview"
```

---

## Task 6: 编辑器图片按钮 `src/components/EditorPane.jsx`

**Files:**
- Modify: `src/components/EditorPane.jsx`

**Step 1: 修改**

在 import 区加入：
```jsx
import { useImages } from '../contexts/ImageContext.jsx';
```

组件内加：
```jsx
const { openGallery } = useImages();
```

将 AI 按钮区域（`src/components/EditorPane.jsx:35-39`）替换为：
```jsx
        {!previewMode && (
          <>
            <button className="btn-ai" onClick={openGallery} title={t('editor.image.tooltip')}>
              🖼
            </button>
            <button className="btn-ai" onClick={openAiDrawer} title={t('editor.ai.tooltip')}>
              AI+
            </button>
          </>
        )}
```

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/components/EditorPane.jsx
git commit -m "feat: add image button in editor"
```

---

## Task 7: 挂载 Provider 与抽屉 `src/App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Step 1: 修改**

- import 区加入：
```jsx
import { ImageProvider } from './contexts/ImageContext.jsx';
import { ImageGalleryDrawer } from './components/images/ImageGalleryDrawer.jsx';
```

- Provider 嵌套调整（ImageProvider 需在 NotesProvider 内、GitHubConfigProvider 内）：
```jsx
        <GitHubConfigProvider>
          <NotesProvider>
            <ImageProvider>
              <AiProvider>
                <AppShell />
              </AiProvider>
            </ImageProvider>
          </NotesProvider>
        </GitHubConfigProvider>
```

- AppShell 渲染区加入 `<ImageGalleryDrawer />`（放在 `<InsertModeModal />` 之后）。

**Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 3: 提交**

```bash
git add src/App.jsx
git commit -m "feat: mount image provider and gallery drawer"
```

---

## Task 8: 样式 `src/styles/image-gallery.css`

**Files:**
- Create: `src/styles/image-gallery.css`
- Modify: `src/main.jsx`（import 新样式）

**Step 1: 创建样式文件**

```css
/* ===== IMAGE GALLERY ===== */
.gallery-overlay {
  position: fixed; inset: 0;
  background: rgba(59,52,39,0.35);
  backdrop-filter: blur(3px);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
}
.gallery-drawer {
  width: 520px;
  max-width: 95vw;
  height: 100vh;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slideInRight 0.25s ease;
  overflow: hidden;
}
.gallery-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.gallery-header h2 {
  font-family: 'Noto Serif SC', serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}
.gallery-header .close-btn {
  width: 32px; height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  transition: all var(--transition);
}
.gallery-header .close-btn:hover { background: var(--surface-hover); color: var(--text); }
.gallery-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gallery-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.gallery-upload .btn-primary {
  height: 38px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
}
.gallery-upload .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.gallery-upload .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.gallery-compress {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.gallery-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.8;
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.gallery-card {
  position: relative;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--paper);
  overflow: hidden;
  transition: all var(--transition);
}
.gallery-card:hover { border-color: var(--accent); }
.gallery-card-main {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: 'Noto Sans SC', sans-serif;
}
.gallery-card-main:disabled { opacity: 0.6; cursor: wait; }
.gallery-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--surface-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery-thumb-loading,
.gallery-thumb-failed {
  color: var(--text-muted);
  font-size: 18px;
}
.gallery-card-name {
  padding: 6px 8px 0;
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gallery-card-size {
  padding: 0 8px 6px;
  font-size: 10px;
  color: var(--text-muted);
}
.gallery-card-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition);
}
.gallery-card:hover .gallery-card-actions { opacity: 1; }
.gallery-card-actions button {
  width: 26px; height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.45);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}
.gallery-card-actions button:hover { background: rgba(0,0,0,0.7); }
```

**Step 2: 修改 `src/main.jsx`**

在 import 区（`language-toggle.css` 之后）加入：
```js
import './styles/image-gallery.css';
```

**Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 4: 提交**

```bash
git add src/styles/image-gallery.css src/main.jsx
git commit -m "feat: add image gallery styles"
```

---

## Task 9: i18n 文案

**Files:**
- Modify: `src/i18n/zh.js`
- Modify: `src/i18n/en.js`

**Step 1: zh.js**

在 `'editor.ai.tooltip'` 后加 `'editor.image.tooltip': '插入图片',`；
在 `'dir.root'` 前加入：

```js
    'gallery.title': '图片库',
    'gallery.upload': '上传图片',
    'gallery.uploading': '上传中...',
    'gallery.compress': '自动压缩',
    'gallery.loading': '加载中...',
    'gallery.empty': '还没有图片<br>点击「上传图片」开始',
    'gallery.copy': '复制链接',
    'gallery.delete': '删除',
    'gallery.delete_confirm': '确定删除这张图片吗？删除后笔记中的引用将失效。',
    'gallery.toast.list_failed': '加载图片失败: ',
    'gallery.toast.upload_failed': '上传失败: ',
    'gallery.toast.uploaded': '已上传 ',
    'gallery.toast.deleted': '图片已删除',
    'gallery.toast.delete_failed': '删除失败: ',
    'gallery.toast.insert_done': '图片已插入',
    'gallery.toast.insert_failed': '插入失败: ',
    'gallery.toast.copy_done': '链接已复制',
    'gallery.toast.copy_failed': '复制失败: ',
```

**Step 2: en.js**

对应加入：

```js
    'editor.image.tooltip': 'Insert Image',
    'gallery.title': 'Image Gallery',
    'gallery.upload': 'Upload Images',
    'gallery.uploading': 'Uploading...',
    'gallery.compress': 'Auto compress',
    'gallery.loading': 'Loading...',
    'gallery.empty': 'No images yet<br>Click "Upload Images" to start',
    'gallery.copy': 'Copy URL',
    'gallery.delete': 'Delete',
    'gallery.delete_confirm': 'Delete this image? References in notes will break.',
    'gallery.toast.list_failed': 'Failed to load images: ',
    'gallery.toast.upload_failed': 'Upload failed: ',
    'gallery.toast.uploaded': 'Uploaded ',
    'gallery.toast.deleted': 'Image deleted',
    'gallery.toast.delete_failed': 'Delete failed: ',
    'gallery.toast.insert_done': 'Image inserted',
    'gallery.toast.insert_failed': 'Insert failed: ',
    'gallery.toast.copy_done': 'URL copied',
    'gallery.toast.copy_failed': 'Copy failed: ',
```

**Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。

**Step 4: 提交**

```bash
git add src/i18n/zh.js src/i18n/en.js
git commit -m "feat: add i18n for image gallery"
```

---

## Task 10: 手动功能验证

**Files:** 无代码修改

**Step 1: 启动 dev server**

Run: `npm run dev`
Expected: Vite dev server 启动成功，打开 `http://localhost:5173/app.html`（或提示的实际端口）。

**Step 2: 验证清单**

1. 配置 GitHub 连接（token + owner + repo，私有仓库）
2. 新建/打开一篇笔记，编辑器右上角出现 🖼 按钮
3. 点击 🖼 → 图库抽屉打开，显示"还没有图片"
4. 上传 2-3 张图（含 1 张 PNG、1 张大尺寸 JPG）：
   - 压缩默认开启，观察上传后 size 显示变小
   - 关闭压缩再传 1 张，验证原图上传
5. 图库出现缩略图（懒加载）
6. 点击缩略图 → 编辑器光标处出现 `![xxx](https://raw.githubusercontent.com/...)`，抽屉自动关闭
7. 切到预览模式 → 图片正常显示（验证 Blob URL 路径，私库关键点）
8. 再开一篇笔记插入同一张图 → 预览仍正常（验证 Blob 缓存）
9. 点击 🗑 删除一张图 → 确认后从列表移除
10. 刷新页面 → 图库列表仍正确（图片已在仓库中）
11. 切换目录页签（life/work）→ 图片仍全局可见
12. 移动端宽度（<768px）→ 抽屉占满可用宽度

**Step 3: 修复发现的问题**

如有问题，回到对应 Task 修复并重新构建验证。

**Step 4: 提交修复（如有）**

```bash
git add -A
git commit -m "fix: gallery issues found in manual testing"
```

---

## 收尾

- 全部任务完成后 `npm run build` 生成最新 `dist/`，`gmnotes.html` 由 build 脚本自动产出
- 更新 `README.md` 功能表（可选）
- 检查 `git status` 干净、提交历史清晰
