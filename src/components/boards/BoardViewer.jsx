// 白板查看器：从仓库 whiteboards/ 读取 → 应用内渲染（可编辑）→ 支持保存覆盖 html + 缩略图
import { useRef, useState, useEffect } from 'react';
import { Quickdraw } from '@quickdrawjs/react';
import '@quickdrawjs/core/quickdraw.css';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useBoard } from '../../contexts/BoardContext.jsx';
import { useGitHubConfig } from '../../contexts/GitHubConfigContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  extractSnapshot, boardNameFromUrl, boardThumbName,
  getBoardFile, uploadBoard, uploadBoardThumb, uploadBoardWithShaRetry, buildBoardHtml, getBoardRawUrl, newFileSha
} from '../../lib/boardApi';
import { rawUrlToPath, invalidateBlobUrl } from '../../lib/imageApi';
import { blobToBase64 } from '../../lib/imageCompression';

export function BoardViewer() {
  const { t } = useI18n();
  const { viewer, closeViewer, notifyBoardSaved } = useBoard();
  const { githubConfigRef } = useGitHubConfig();
  const { showToast } = useToast();
  const quickdrawRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 记录白板文件与缩略图 sha，用于覆盖更新
  const metaRef = useRef({ htmlSha: null, thumbSha: null });

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
      // 尝试获取缩略图 sha（文件可能不存在，尽力而为）
      try {
        const thumbFile = await getBoardFile(config, boardThumbName(boardNameFromUrl(viewer.url)));
        metaRef.current.thumbSha = thumbFile.sha;
      } catch (e) {
        metaRef.current.thumbSha = null;
      }
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

      // 2) 更新/创建缩略图（尽力而为，单独 try；失败不应阻断保存但必须提示用户）
      const thumbName = boardThumbName(name);
      // 决定性诊断：保存时 store 里到底有多少记录/图形（决定 exportImage 是否可能返回 null）
      try {
        console.log('[board save] 缩略图前置诊断', {
          thumbName,
          storeSize: qd.editor.store.size,
          shapeCount: qd.editor.store.shapes().length,
          snapshotKeys: Object.keys(snapshotNow.document?.store || {}).length
        });
      } catch (diagErr) { console.warn('[board save] 诊断失败', diagErr); }
      let thumbBlobUrl = null;
      try {
        // GitHub Contents API 对单文件大小有限制（约 1MB）。
        // 先按 2x 导出；结果为空或过大（>900KB，留出 base64 膨胀余量）时降级到 1x 重试。
        let thumbBlob = null;
        let thumbExportOpts = null;
        for (const opts of [
          { background: true, scale: 2, margin: 48 },
          { background: true, scale: 1, margin: 24 },
        ]) {
          thumbExportOpts = opts;
          thumbBlob = await qd.editor.exportImage(opts);
          const size = thumbBlob ? thumbBlob.size : 0;
          console.log(`[board save] 缩略图导出(scale=${opts.scale}) → size=${size}`, size >= 900 * 1024 ? '(过大，降级重试)' : '');
          if (thumbBlob && size > 0 && size < 900 * 1024) break;
          thumbBlob = null;
        }
        if (!thumbBlob) {
          // 明确提示：导出为空（画布无图形或画布过大），不再静默跳过
          showToast(t('board.toast.thumb_failed') + ' export empty', 'error');
          console.warn('[board save] 缩略图导出为空（画布无图形或过大），跳过缩略图上传', thumbExportOpts);
        } else {
          const thumbBase64 = await blobToBase64(thumbBlob);
          // 覆盖已存在文件必须带最新 sha；load 时若未拿到则此处兜底重取（覆盖文件时缺 sha 会被 GitHub 拒绝）
          let thumbSha = metaRef.current.thumbSha;
          if (!thumbSha) {
            try { thumbSha = (await getBoardFile(config, thumbName)).sha; } catch (e) { thumbSha = undefined; }
          }
          console.log('[board save] 上传缩略图', { thumbName, thumbSha, size: thumbBlob.size });
          const thumbRes = await uploadBoardWithShaRetry(config, thumbName, thumbBase64, thumbSha, uploadBoardThumb);
          const thumbNewSha = newFileSha(thumbRes);
          console.log('[board save] 缩略图上传成功', { newSha: thumbNewSha });
          if (thumbNewSha) metaRef.current.thumbSha = thumbNewSha;
          try { thumbBlobUrl = URL.createObjectURL(thumbBlob); } catch (e) { /* 尽力而为 */ }
        }
      } catch (thumbErr) {
        // 明确告警：仓库中的缩略图未更新，预览重载后仍会是旧图（白板内容 html 已保存）
        showToast(t('board.toast.thumb_failed') + ' ' + (thumbErr.message || ''), 'error');
        console.warn('[board save] 缩略图更新失败（html 已保存）', thumbErr);
      }

      // 3) 通知预览立即刷新为新缩略图：失效旧的 blob 缓存 + 注入新图（尽力而为，失败不阻断保存）
      let thumbRawUrl = null;
      try {
        thumbRawUrl = await getBoardRawUrl(config, thumbName);
      } catch (e) {
        console.warn('[board save] 获取缩略图 raw URL 失败', e);
      }
      if (thumbRawUrl) invalidateBlobUrl(thumbRawUrl);
      notifyBoardSaved({ thumbRawUrl, blobUrl: thumbBlobUrl });

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