// ImageContext：图库状态管理
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { useGitHubConfig } from './GitHubConfigContext';
import * as imageApi from '../lib/imageApi';
import { compressImage, blobToBase64, originalExt } from '../lib/imageCompression';

const ImageContext = createContext(null);

let nameSeq = 0;

function timestampName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  nameSeq = (nameSeq + 1) % 1000;
  const seq = String(nameSeq).padStart(3, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${seq}`;
}

export function ImageProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { githubConfigRef, githubReady, configVersion } = useGitHubConfig();

  const [showGallery, setShowGallery] = useState(false);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressEnabled, setCompressEnabled] = useState(true);

  // 配置变化（切换仓库/清除配置）时清空旧图库数据
  useEffect(() => {
    setImages([]);
  }, [configVersion]);

  const refreshImages = useCallback(async () => {
    if (!githubReady) return;
    const config = githubConfigRef.current;
    setLoading(true);
    try {
      const items = await imageApi.listImages(config);
      setImages(items);
    } catch (e) {
      showToast(t('gallery.toast.list_failed') + (e.message || ''), 'error');
      console.error('[listImages]', e);
    } finally {
      setLoading(false);
    }
  }, [githubReady, githubConfigRef, showToast, t]);

  const openGallery = useCallback(() => {
    setShowGallery(true);
    refreshImages();
  }, [refreshImages]);

  const closeGallery = useCallback(() => setShowGallery(false), []);

  const uploadFiles = useCallback(async (files) => {
    if (!githubReady || !files || !files.length) return;
    const config = githubConfigRef.current;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        if (!file.type || !file.type.startsWith('image/')) continue;
        try {
          let blob = file;
          let ext = originalExt(file);
          if (compressEnabled) {
            const r = await compressImage(file);
            blob = r.blob;
            ext = r.ext;
          }
          const base64 = await blobToBase64(blob);
          const name = timestampName() + '_' + ext;
          await imageApi.uploadImage(config, name, base64);
          ok++;
        } catch (e) {
          console.error('[uploadImage]', file.name, e);
          showToast(t('gallery.toast.upload_failed') + (file.name || '') + ' ' + (e.message || ''), 'error');
        }
      }
      if (ok > 0) {
        showToast(t('gallery.toast.uploaded') + ok, 'success');
        await refreshImages();
      }
    } finally {
      setUploading(false);
    }
  }, [githubReady, githubConfigRef, compressEnabled, refreshImages, showToast, t]);

  const deleteImage = useCallback(async (image) => {
    const config = githubConfigRef.current;
    try {
      await imageApi.deleteImage(config, image.name);
      setImages(prev => prev.filter(i => i.name !== image.name));
      showToast(t('gallery.toast.deleted'), 'info');
    } catch (e) {
      showToast(t('gallery.toast.delete_failed') + (e.message || ''), 'error');
      console.error('[deleteImage]', e);
    }
  }, [githubConfigRef, showToast, t]);

  const value = useMemo(() => ({
    showGallery, openGallery, closeGallery,
    images, loading, uploading,
    compressEnabled, setCompressEnabled,
    refreshImages, uploadFiles, deleteImage
  }), [showGallery, openGallery, closeGallery, images, loading, uploading,
      compressEnabled, refreshImages, uploadFiles, deleteImage]);

  return <ImageContext.Provider value={value}>{children}</ImageContext.Provider>;
}

export function useImages() {
  const ctx = useContext(ImageContext);
  if (!ctx) throw new Error('useImages must be used within ImageProvider');
  return ctx;
}
