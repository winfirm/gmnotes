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
    let cancelled = false;
    getRawUrl(githubConfigRef.current, image.name)
      .then(rawUrl => getBlobUrlForRaw(githubConfigRef.current, rawUrl))
      .then(url => { if (!cancelled && url) setSrc(url); else if (!cancelled) setFailed(true); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [visible, image.name, githubConfigRef]);

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
    if (busy) return;
    if (!window.confirm(t('gallery.delete_confirm'))) return;
    setBusy(true);
    await deleteImage(image);
    setBusy(false);
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
        <button onClick={handleDelete} title={t('gallery.delete')} disabled={busy}>🗑</button>
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
