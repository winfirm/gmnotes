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
