// 预览：注入 HTML 后将仓库图片替换为 Blob URL（私库支持）+ Mermaid 渲染（流程图/时序图/思维导图等）
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { useBoard } from '../contexts/BoardContext.jsx';
import { getBlobUrlForRaw } from '../lib/imageApi';
import { BOARD_DIR } from '../lib/boardApi';

// mermaid 运行时懒加载（CDN），避免打包进 singlefile 产物(import mermaid异常无法运行)
let mermaidInstance = null;
let mermaidLoading = false;
let mermaidReady = false;

async function loadMermaid() {
  if (mermaidReady) return mermaidInstance;
  if (mermaidLoading) return null;
  mermaidLoading = true;
  try {
    // 动态注入 CDN script
    await new Promise((resolve, reject) => {
      if (document.getElementById('mermaid-cdn')) { resolve(); return; }
      const s = document.createElement('script');
      s.id = 'mermaid-cdn';
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    mermaidInstance = window.mermaid;
    mermaidInstance.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    mermaidReady = true;
    return mermaidInstance;
  } catch (e) {
    console.warn('[Mermaid] CDN load failed:', e);
    return null;
  } finally {
    mermaidLoading = false;
  }
}

export function PreviewPane({ html }) {
  const { githubConfigRef, githubReady, configVersion } = useGitHubConfig();
  // openViewer 用于点击白板链接；lastSavedThumb 驱动缩略图即时刷新（context 状态，必被响应）
  const { openViewer, lastSavedThumb } = useBoard();
  const containerRef = useRef(null);
  const prevHtmlRef = useRef(null);

  // 点击 whiteboards 链接 → 应用内打开白板查看器（不跳转 raw 源码页）
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;

    const handleClick = (e) => {
      const a = e.target.closest('a');
      if (!a || !a.href) return;
      const href = a.getAttribute('href') || '';
      // 仅拦截本仓库 whiteboards/ 目录的链接
      const prefix = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/`;
      if (!href.startsWith(prefix) || !href.includes('/' + BOARD_DIR + '/')) return;
      e.preventDefault();
      // 嵌套图片链接的标题取自 alt，纯文本链接取 textContent
      const img = a.querySelector('img');
      const title = img ? (img.alt || '') : (a.textContent.trim() || '');
      openViewer(a.href, title);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [html, githubReady, configVersion]);

  // 1. 图片 blob URL 替换
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('img').forEach((img) => {
      // 已是 blob 的 img 保持原样，且绝不能覆盖 dataset.raw（此时 getAttribute('src') 是 blob:）
      if (img.src.startsWith('blob:')) return;
      const rawUrl = img.getAttribute('src') || '';
      if (rawUrl) img.dataset.raw = rawUrl;
      getBlobUrlForRaw(config, rawUrl)
        .then(url => {
          if (url && container.contains(img)) img.src = url;
        })
        .catch(() => { /* 非本仓库图片或拉取失败，保持原样 */ });
    });
  }, [html, githubReady, configVersion]);

  // 1b. 白板保存后，立即把新缩略图注入预览（context 状态驱动，确定性触发；blob 直传零网络）
  //     无新 blob（缩略图导出/上传失败）时走 token API 重拉仓库最新；绝不把 img.src 设回 raw URL（私库 403）
  useLayoutEffect(() => {
    if (!lastSavedThumb || !lastSavedThumb.thumbRawUrl) return;
    const d = lastSavedThumb;
    const container = containerRef.current;
    if (!container) return;
    const config = githubConfigRef.current;
    let matched = 0;
    container.querySelectorAll('img').forEach((img) => {
      const raw = img.dataset.raw || img.getAttribute('src') || '';
      if (!raw || raw !== d.thumbRawUrl) return;
      matched++;
      if (d.blobUrl) {
        console.log('[preview] 白板缩略图已注入（blob 直传）', raw.slice(-30));
        img.src = d.blobUrl;
      } else {
        // blob 缓存已由保存方失效，此拉取即仓库最新内容
        console.log('[preview] 白板缩略图重载（token API）', raw.slice(-30));
        getBlobUrlForRaw(config, raw)
          .then(url => { if (url && container.contains(img)) img.src = url; })
          .catch(() => {});
      }
    });
    console.log('[preview] 保存事件处理：', { thumbRawUrl: d.thumbRawUrl, hasBlob: !!d.blobUrl, matched, imgCount: container.querySelectorAll('img').length });
  }, [lastSavedThumb]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Mermaid 渲染：html 变化时懒加载并运行
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevHtmlRef.current === html) return;
    prevHtmlRef.current = html;

    // 检查是否包含 mermaid 代码块，没有则跳过（零开销）
    const nodes = container.querySelectorAll('.language-mermaid');
    if (nodes.length === 0) return;

    let cancelled = false;
    loadMermaid().then(m => {
      if (cancelled || !m) return;
      m.run({ nodes: container.querySelectorAll('.language-mermaid') })
        .catch(err => console.warn('[Mermaid] render failed:', err));
    });

    return () => { cancelled = true; };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="preview-pane"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
