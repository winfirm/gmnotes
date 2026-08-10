// 画图模态框：Quickdraw 白板画布 + 导出为静态 HTML 上传到 whiteboards/
import { useRef, useState } from 'react';
import { Quickdraw } from '@quickdrawjs/react';
import '@quickdrawjs/core/quickdraw.css';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useBoard } from '../../contexts/BoardContext.jsx';
import { useNotes } from '../../contexts/NotesContext.jsx';
import { useGitHubConfig } from '../../contexts/GitHubConfigContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { boardName, buildBoardHtml, uploadBoard, getBoardRawUrl, boardIframeMarkdown } from '../../lib/boardApi';

export function BoardDrawer() {
  const { t } = useI18n();
  const { showDraw, closeDraw } = useBoard();
  const { insertContent } = useNotes();
  const { githubConfigRef, githubReady } = useGitHubConfig();
  const { showToast } = useToast();
  const quickdrawRef = useRef(null);
  const [saving, setSaving] = useState(false);

  if (!showDraw) return null;

  const handleInsert = async () => {
    if (!githubReady) {
      showToast(t('board.toast.config_required'), 'error');
      return;
    }
    const qd = quickdrawRef.current;
    if (!qd || !qd.editor) return;
    setSaving(true);
    try {
      const snapshot = qd.editor.store.getSnapshot();
      if (!snapshot || Object.keys(snapshot).length === 0) {
        showToast(t('board.toast.empty'), 'error');
        return;
      }
      const config = githubConfigRef.current;
      const name = boardName();
      const html = buildBoardHtml(snapshot);
      await uploadBoard(config, name, html);

      const url = await getBoardRawUrl(config, name);
      const title = name.replace(/\.html$/, '');
      insertContent(boardIframeMarkdown(url, title), 'cursor');
      closeDraw();
      showToast(t('board.toast.insert_done'), 'success');
    } catch (e) {
      showToast(t('board.toast.insert_failed') + (e.message || ''), 'error');
      console.error('[board insert]', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="board-overlay" onClick={closeDraw}>
      <div className="board-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="board-header">
          <h2>✏️ {t('board.title')}</h2>
          <button className="close-btn" onClick={closeDraw} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="board-body">
          <Quickdraw ref={quickdrawRef} theme="light" grid="dots" autoFit watermark={false} />
        </div>
        <div className="board-footer">
          <button onClick={closeDraw} disabled={saving}>{t('board.cancel')}</button>
          <button className="btn-primary" onClick={handleInsert} disabled={saving}>
            {saving ? t('board.saving') : t('board.insert')}
          </button>
        </div>
      </div>
    </div>
  );
}