// GitHub 图片 API 封装（基于 Contents API）
import { apiBase, githubFetch, githubDelete } from './githubApi';

export const IMAGE_DIR = 'images';

// 默认分支缓存：owner/repo -> branch
const branchCache = new Map();
// raw URL -> Blob URL 缓存（跨渲染复用）
const blobUrlCache = new Map();
// 进行中的下载：rawUrl -> Promise
const inflight = new Map();

function imagePath(name) {
  return IMAGE_DIR + '/' + name;
}

/** 获取仓库默认分支（构造 raw URL 用），带缓存 */
export async function getDefaultBranch(config) {
  const key = config.owner + '/' + config.repo;
  if (branchCache.has(key)) return branchCache.get(key);
  const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const branch = data.default_branch || 'main';
  branchCache.set(key, branch);
  return branch;
}

/** 构造图片 raw URL（需要默认分支） */
export async function getRawUrl(config, name) {
  const branch = await getDefaultBranch(config);
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${branch}/${imagePath(name)}`;
}

/** 列出 images/ 下全部文件；目录不存在返回空数组 */
export async function listImages(config) {
  try {
    const data = await githubFetch(config, apiBase(config) + '/' + IMAGE_DIR);
    const items = Array.isArray(data) ? data : [];
    return items
      .filter(f => f.type === 'file')
      .map(f => ({
        name: f.name,
        path: f.path,
        size: f.size,
        sha: f.sha
      }));
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return [];
    }
    throw e;
  }
}

/** 上传图片：base64 内容 PUT 到 images/{name} */
export async function uploadImage(config, name, base64) {
  const body = {
    message: 'Upload image via GMNotes',
    content: base64
  };
  return githubFetch(config, apiBase(config) + '/' + imagePath(name), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/** 删除图片：先 GET 拿 sha 再 DELETE */
export async function deleteImage(config, name) {
  const existing = await githubFetch(config, apiBase(config) + '/' + imagePath(name));
  return githubDelete(config, apiBase(config) + '/' + imagePath(name) + '?sha=' + existing.sha);
}

/** 带 token 下载图片为 Blob（私库预览用） */
export async function fetchImageBlob(config, path) {
  const res = await fetch(apiBase(config) + '/' + path, {
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3.raw'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** 从 raw URL 解析仓库内路径；非本仓库 URL 返回 null */
export function rawUrlToPath(config, rawUrl) {
  const prefix = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/`;
  if (!rawUrl || !rawUrl.startsWith(prefix)) return null;
  const rest = rawUrl.slice(prefix.length);
  const parts = rest.split('/');
  if (parts.length < 2) return null;
  return parts.slice(1).join('/'); // 去掉 branch 段
}

/** 获取 raw URL 对应的 Blob URL（缓存 + 去重） */
export function getBlobUrlForRaw(config, rawUrl) {
  if (blobUrlCache.has(rawUrl)) return Promise.resolve(blobUrlCache.get(rawUrl));
  if (inflight.has(rawUrl)) return inflight.get(rawUrl);
  const path = rawUrlToPath(config, rawUrl);
  if (!path) return Promise.resolve(null);
  const p = fetchImageBlob(config, path)
    .then(blob => {
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(rawUrl, url);
      return url;
    })
    .catch(err => {
      inflight.delete(rawUrl);
      throw err;
    });
  inflight.set(rawUrl, p);
  return p;
}
