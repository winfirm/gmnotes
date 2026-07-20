// Markdown 渲染缓存
import { useMemo } from 'react';
import { marked } from 'marked';
import { t } from '../i18n';

export function useMarkdownRenderer(content, locale) {
  return useMemo(() => {
    if (!content) return '<p style="color:#b8b0a4">' + t('app.no_content', locale) + '</p>';
    try {
      return marked.parse(content);
    } catch (e) {
      return '<p style="color:#c5554a">' + t('app.markdown_error', locale) + '</p>';
    }
  }, [content, locale]);
}
