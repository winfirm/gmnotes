// 预览：注入 HTML 后将仓库图片替换为 Blob URL（私库支持）
import { useLayoutEffect, useRef } from 'react';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { getBlobUrlForRaw } from '../lib/imageApi';

export function PreviewPane({ html }) {
  const { githubConfigRef, githubReady, configVersion } = useGitHubConfig();
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !githubReady) return;
    const config = githubConfigRef.current;
    container.querySelectorAll('img').forEach((img) => {
      // 已替换为 blob URL 的跳过，避免每次输入重新替换造成闪烁/抖动
      if (img.src.startsWith('blob:')) return;
      const rawUrl = img.getAttribute('src') || '';
      getBlobUrlForRaw(config, rawUrl)
        .then(url => {
          if (url && container.contains(img)) img.src = url;
        })
        .catch(() => { /* 非本仓库图片或拉取失败，保持原样 */ });
    });
  }, [html, githubReady, configVersion]);

  return (
    <div
      ref={containerRef}
      className="preview-pane"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
