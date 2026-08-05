// 图片压缩工具：canvas 缩放 + 格式转换（浏览器端）
export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.8;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('压缩失败')), type, quality);
  });
}

// GIF/SVG 等不支持 canvas 处理的格式直接返回原图
function isCompressible(file) {
  const type = (file.type || '').toLowerCase();
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export function originalExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? m[1].toLowerCase() : 'png';
}

function pickOutputType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/png') return 'image/webp'; // PNG 转 WebP：保留透明且体积小
  if (type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function extForType(type) {
  return type === 'image/webp' ? 'webp' : 'jpg';
}

/**
 * 压缩图片。返回 { blob, ext }；不可压缩或压缩后更大时返回原图。
 * @param {File|Blob} file
 * @param {{maxEdge?:number, quality?:number}} options
 */
export async function compressImage(file, options = {}) {
  const maxEdge = options.maxEdge || MAX_EDGE;
  const quality = options.quality ?? JPEG_QUALITY;
  if (!isCompressible(file)) {
    return { blob: file, ext: originalExt(file) };
  }
  const img = await loadImage(file);
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  // 小图直接返回原图
  if (w <= maxEdge && h <= maxEdge && file.size < 300 * 1024) {
    return { blob: file, ext: originalExt(file) };
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);
  const outType = pickOutputType(file);
  let blob;
  try {
    blob = await canvasToBlob(canvas, outType, quality);
  } catch (e) {
    // WebP 不支持时回退 PNG
    blob = await canvasToBlob(canvas, 'image/png', 0.9);
  }
  // 压缩后仍大于原图则保留原图
  if (blob.size >= file.size) {
    return { blob: file, ext: originalExt(file) };
  }
  return { blob, ext: extForType(outType) };
}

/** Blob/File → base64（去掉 data URL 前缀） */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}
