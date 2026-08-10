// 白板查看器：从仓库 whiteboards/ 读取 → 应用内渲染（可编辑）→ 保存覆盖 html（内嵌 iframe 预览随之刷新）
import { useRef, useState, useEffect } from 'react';
import { Quickdraw } from '@quickdrawjs/react';
import '@quickdrawjs/core/quickdraw.css';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useBoard } from '../../contexts/BoardContext.jsx';
import { useGitHubConfig } from '../../contexts/GitHubConfigContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  extractSnapshot, boardNameFromUrl,
  getBoardFile, uploadBoard, uploadBoardWithShaRetry, buildBoardHtml, getBoardRawUrl, newFileSha, invalidateBoardHtmlBlob
} from '../../lib/boardApi';
import { rawUrlToPath } from '../../lib/imageApi';

export function BoardViewer() {
  const { t } = useI18n();
  const { viewer, closeViewer, notifyBoardSaved } = useBoard();
  const { githubConfigRef } = useGitHubConfig();
  const { showToast } = useToast();
  const quickdrawRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 记录白板文件 sha，用于覆盖更新
  const metaRef = useRef({ htmlSha: null });

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const config = githubConfigRef.current;
    const path = viewer.url && config ? rawUrlToPath(config, viewer.url) : null;
    if (!path || !config) {
      showToast(t('board.toast.load_failed') + 'invalid url', 'error');
      return undefined;
    }
    setLoading(true);
    setSnapshot(null);

    const load = async () => {
      // 拉取 html 内容与 sha
      const file = await getBoardFile(config, boardNameFromUrl(viewer.url));
      if (cancelled) return;
      const snap = extractSnapshot(file.html);
      if (!snap) {
        showToast(t('board.toast.load_failed') + 'parse', 'error');
        return;
      }
      metaRef.current.htmlSha = file.sha;
      if (cancelled) return;
      setSnapshot(snap);
    };

    load()
      .catch(e => {
        if (!cancelled) {
          showToast(t('board.toast.load_failed') + (e.message || ''), 'error');
          console.error('[board load]', e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewer, githubConfigRef]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!viewer) return null;

  const handleSave = async () => {
    const qd = quickdrawRef.current;
    if (!qd || !qd.editor) return;
    const config = githubConfigRef.current;
    if (!config) {
      showToast(t('board.toast.config_required'), 'error');
      return;
    }
    setSaving(true);
    try {
      const name = boardNameFromUrl(viewer.url);
      if (!name) throw new Error('invalid board url');
      const snapshotNow = qd.editor.store.getSnapshot();

      // 1) 更新 html 快照（覆盖；sha 过期时自动重取重试）
      const html = buildBoardHtml(snapshotNow);
      const htmlRes = await uploadBoardWithShaRetry(config, name, html, metaRef.current.htmlSha || undefined, uploadBoard);
      const htmlNewSha = newFileSha(htmlRes);
      if (htmlNewSha) metaRef.current.htmlSha = htmlNewSha;

      // 2) 通知预览刷新内嵌 iframe：失效旧 html blob + 触发重新拉取（尽力而为，失败不阻断保存）
      let boardRawUrl = null;
      try {
        boardRawUrl = await getBoardRawUrl(config, name);
      } catch (e) {
        console.warn('[board save] 获取白板 raw URL 失败', e);
      }
      if (boardRawUrl) invalidateBoardHtmlBlob(boardRawUrl);
      notifyBoardSaved({ boardRawUrl });

      showToast(t('board.toast.save_done'), 'success');
      setSaving(false);
      closeViewer();
    } catch (e) {
      showToast(t('board.toast.save_failed') + (e.message || ''), 'error');
      console.error('[board save]', e);
      setSaving(false);
    }
  };

  return (
    <div className="board-overlay" onClick={closeViewer}>
      <div className="board-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="board-header">
          <h2>✏️ {viewer.title || t('board.viewer_title')}</h2>
          <div className="board-header-actions">
            <button className="btn-primary" onClick={handleSave} disabled={saving || loading || !snapshot}>
              {saving ? t('board.saving') : t('board.save')}
            </button>
            <button className="close-btn" onClick={closeViewer} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="board-body">
          {loading ? (
            <div className="board-loading">{t('board.loading')}</div>
          ) : snapshot ? (
            <Quickdraw
              ref={quickdrawRef}
              theme="light"
              grid="dots"
              snapshot={snapshot}
              autoFit
              watermark={false}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}