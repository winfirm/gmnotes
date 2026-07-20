// GitHub Contents API 封装（纯函数，参数化 config）
import { utf8ToBase64, base64ToUtf8 } from './base64';
import { generateId } from './generateId';

export function apiBase(config) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents`;
}

export function indexPath(config) {
  const p = config.path ? config.path + '/' : '';
  return p + 'index.json';
}

export function notePath(config, noteId) {
  const p = config.path ? config.path + '/' : '';
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

export async function saveNoteFile(config, noteId, content) {
  let sha = null;
  try {
    const existing = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId));
    sha = existing.sha;
  } catch (e) { /* file may not exist */ }
  const body = {
    message: 'Update note ' + noteId,
    content: utf8ToBase64(content)
  };
  if (sha) body.sha = sha;
  return githubFetch(config, apiBase(config) + '/' + notePath(config, noteId), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function saveIndex(config, sha, notes, msg) {
  const body = {
    message: msg || 'Update index',
    content: utf8ToBase64(JSON.stringify({ notes: notes }, null, 2))
  };
  if (sha) body.sha = sha;
  const result = await githubFetch(config, apiBase(config) + '/' + indexPath(config), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  return result.content.sha; // 返回新 sha
}

export async function syncIndex(config) {
  const data = await githubFetch(config, apiBase(config) + '/' + indexPath(config));
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

export async function loadNoteContent(config, noteId) {
  const data = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId));
  return base64ToUtf8(data.content);
}

export async function deleteNoteFile(config, noteId) {
  try {
    const existing = await githubFetch(config, apiBase(config) + '/' + notePath(config, noteId));
    await githubDelete(config, apiBase(config) + '/' + notePath(config, noteId) + '?sha=' + existing.sha);
  } catch (e) { /* file may not exist */ }
}
