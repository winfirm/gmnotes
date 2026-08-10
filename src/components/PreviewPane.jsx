// 预览：注入 HTML 后将仓库图片替换为 Blob URL（私库支持）+ Mermaid 渲染（流程图/时序图/思维导图等）
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { useBoard } from '../contexts/BoardContext.jsx';
import { getBlobUrlForRaw } from '../lib/imageApi';
import { BOARD_DIR, getBoardHtmlBlobUrl } from '../lib/boardApi';

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
  // openViewer 用于点击白板链接；lastSavedBoard 驱动内嵌 iframe 即时刷新（context 状态，必被响应）
  const { openViewer, lastSavedBoard } = useBoard();
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
      // 嵌套图片链接的标题取自 alt，纯文本链接取 textContent（去掉插入时的 ✏️ 前缀，查看器标题自带）
      const img = a.querySelector('img');
      const rawTitle = img ? (img.alt || '') : (a.textContent.trim() || '');
      const title = rawTitle.replace(/^✏️\s*/, '');
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

  // 1c. 内嵌 iframe：仅 raw.githubusercontent.com 域名的 src 走 token 拉取（REST API + blob 缓存）；
  //     其它域名的 iframe 保持默认加载。是否为本仓库 whiteboards/ 由 getBoardHtmlBlobUrl 内部守卫判定。
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('iframe').forEach((frame) => {
      if (frame.src.startsWith('blob:')) return;
      const rawUrl = frame.getAttribute('src') || '';
      if (!rawUrl.startsWith('https://raw.githubusercontent.com/')) return;
      frame.dataset.raw = rawUrl;
      getBoardHtmlBlobUrl(config, rawUrl)
        .then(url => {
          // 竞态防护：若保存刷新（1d）已把 src 换成新 blob，则初始拉取的旧 blob 不再覆盖
          if (url && container.contains(frame) && frame.getAttribute('src') === rawUrl) frame.src = url;
        })
        .catch(() => { /* 非白板 URL 或拉取失败，保持原样 */ });
    });
  }, [html, githubReady, configVersion]);

  // 1d. 白板保存后刷新内嵌 iframe：缓存已在保存方失效，重新拉取新 html
  useLayoutEffect(() => {
    if (!lastSavedBoard || !lastSavedBoard.boardRawUrl) return;
    const d = lastSavedBoard;
    const container = containerRef.current;
    if (!container) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('iframe').forEach((frame) => {
      const raw = frame.dataset.raw || frame.getAttribute('src') || '';
      if (raw !== d.boardRawUrl) return;
      getBoardHtmlBlobUrl(config, raw)
        .then(url => { if (url && container.contains(frame)) frame.src = url; })
        .catch(() => console.warn('[preview] 白板 iframe 刷新失败', raw.slice(-30)));
    });
  }, [lastSavedBoard]); // eslint-disable-line react-hooks/exhaustive-deps

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
