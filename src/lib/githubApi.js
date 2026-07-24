// GitHub Contents API 封装（纯函数，参数化 config）
import { utf8ToBase64, base64ToUtf8 } from './base64';
import { generateId } from './generateId';

export function apiBase(config) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents`;
}

/**
 * 解析路径字符串，支持逗号分隔多个路径
 * @param {string} pathStr - 路径字符串，如 'life,work' 或 'life, work'
 * @returns {string[]} 路径数组，如 ['life', 'work']
 */
export function parsePath(pathStr) {
  if (!pathStr || !pathStr.trim()) {
    return [''];
  }
  return pathStr.split(',').map(p => p.trim().replace(/\/+$/, '')).filter(p => p !== '');
}

/**
 * 获取当前目录的有效路径
 * @param {string} configPath - 配置中的路径字符串
 * @param {string} currentDir - 当前选中的目录
 * @returns {string} 有效路径
 */
export function getActivePath(configPath, currentDir) {
  const dirs = parsePath(configPath);
  if (currentDir !== undefined && currentDir !== null) {
    // 如果指定了当前目录，使用它
    return currentDir;
  }
  // 否则使用第一个目录
  return dirs[0] || '';
}

export function indexPath(config, dir) {
  const activePath = getActivePath(config.path, dir);
  const p = activePath ? activePath + '/' : '';
  return p + 'index.json';
}

export function notePath(config, noteId, dir) {
  const activePath = getActivePath(config.path, dir);
  const p = activePath ? activePath + '/' : '';
  return p + 'note_' + noteId + '.md';
}

export async function githubFetch(config, url, options = {}) {
  const headers = {
    'Authorization': `token ${config.token}`,
    'Accept': 'application/vnd.github.v3+json',
    ...options.headers
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function githubDelete(config, url) {
  const headers = {
    'Authorization': `token ${config.token}`,
    'Accept': 'application/vnd.github.v3+json'
  };
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function saveNoteFile(config, noteId, content, dir) {
  let sha = null;
  try {
    const existing = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId, dir));
    sha = existing.sha;
  } catch (e) { /* file may not exist */ }
  const body = {
    message: 'Update note ' + noteId,
    content: utf8ToBase64(content)
  };
  if (sha) body.sha = sha;
  return githubFetch(config, apiBase(config) + '/' + notePath(config, noteId, dir), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function saveIndex(config, sha, notes, msg, dir) {
  const body = {
    message: msg || 'Update index',
    content: utf8ToBase64(JSON.stringify({ notes: notes }, null, 2))
  };
  if (sha) body.sha = sha;
  const result = await githubFetch(config, apiBase(config) + '/' + indexPath(config, dir), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  return result.content.sha; // 返回新 sha
}

export async function syncIndex(config, dir) {
  const data = await githubFetch(config, apiBase(config) + '/' + indexPath(config, dir));
  const parsed = JSON.parse(base64ToUtf8(data.content));
  return {
    sha: data.sha,
    notes: (parsed.notes || []).map(n => ({
      id: n.id || generateId(),
      title: n.title || '',
      createdAt: n.createdAt || new Date().toISOString(),
      updatedAt: n.updatedAt || new Date().toISOString()
    }))
  };
}

export async function loadNoteContent(config, noteId, dir) {
  const data = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId, dir));
  return base64ToUtf8(data.content);
}

export async function deleteNoteFile(config, noteId, dir) {
  try {
    const existing = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId, dir));
    await githubDelete(config, apiBase(config) + '/' + notePath(config, noteId, dir) + '?sha=' + existing.sha);
  } catch (e) { /* file may not exist */ }
}
