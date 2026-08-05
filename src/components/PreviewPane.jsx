// 预览：注入 HTML 后将仓库图片替换为 Blob URL（私库支持）+ Mermaid 渲染（流程图/时序图/思维导图等）
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { getBlobUrlForRaw } from '../lib/imageApi';

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
  const containerRef = useRef(null);
  const prevHtmlRef = useRef(null);

  // 1. 图片 blob URL 替换
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('img').forEach((img) => {
      if (img.src.startsWith('blob:')) return;
      const rawUrl = img.getAttribute('src') || '';
      getBlobUrlForRaw(config, rawUrl)
        .then(url => {
          if (url && container.contains(img)) img.src = url;
        })
        .catch(() => { /* 非本仓库图片或拉取失败，保持原样 */ });
    });
  }, [html, githubReady, configVersion]);

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
