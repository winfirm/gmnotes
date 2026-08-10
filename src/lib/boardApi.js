// 白板(quickdraw) API：生成自包含 HTML、上传到 GitHub whiteboards/、读取与提取
import { utf8ToBase64, base64ToUtf8 } from './base64';
import { githubFetch, apiBase } from './githubApi';
import { getDefaultBranch, rawUrlToPath } from './imageApi';

export const BOARD_DIR = 'whiteboards';

// ---- 文件名 ----
let nameSeq = 0;

export function boardName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  nameSeq = (nameSeq + 1) % 1000;
  const seq = String(nameSeq).padStart(3, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${seq}.html`;
}

// ---- HTML 生成 ----
// 将 JSON 序列化为可安全嵌入 <script> 的字面量：
// 把 "<" 转义为 "\u003c"，避免 "</script>" 截断 HTML
function escapeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function buildBoardHtml(snapshot) {
  const json = JSON.stringify(snapshot || {});
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>✏️ 白板</title>
<style>html, body { margin: 0; height: 100%; } #board { width: 100%; height: 100%; }</style>
<link rel="stylesheet" href="https://esm.sh/@quickdrawjs/core@0.2.0/quickdraw.css" />
</head>
<body>
<div id="board"></div>
<script type="module">
import { createQuickdraw } from 'https://esm.sh/@quickdrawjs/core@0.2.0';
const saved = ${escapeJsonForScript(snapshot || {})};
// readonly：该 HTML 仅用于 markdown 预览展示（编辑在应用内 Quickdraw 组件进行），禁止在 iframe 内绘图
const board = createQuickdraw({ container: document.getElementById('board'), hideUi: true, readonly: true, watermark: false });
if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
  board.editor.store.loadSnapshot(saved, 'remote');
}
board.editor.fitContent();
</script>
</body>
</html>`;
}

// ---- JSON 提取 ----
function extractJsonLiteral(html) {
  // 匹配 <script type="module"> 中 `const saved = { ... };` 的 JSON 字面量
  const m = html.match(/const saved = (\{[\s\S]*?\});\n/);
  return m ? m[1] : null;
}

export function extractSnapshot(html) {
  const literal = extractJsonLiteral(html);
  if (!literal) return null;
  return JSON.parse(literal.replace(/\\u003c/g, '<'));
}

// ---- URL 构造 ----
export function boardRawUrl(config, branch, name) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${branch}/${BOARD_DIR}/${name}`;
}

export async function getBoardRawUrl(config, name) {
  const branch = await getDefaultBranch(config);
  return boardRawUrl(config, branch, name);
}

export function boardPath(name) {
  return BOARD_DIR + '/' + name;
}

/** 从 whiteboards raw URL 提取文件名；非白板 URL 返回 null */
export function boardNameFromUrl(rawUrl) {
  if (!rawUrl) return null;
  const idx = rawUrl.indexOf('/' + BOARD_DIR + '/');
  if (idx === -1) return null;
  return rawUrl.slice(idx + BOARD_DIR.length + 2);
}

// ---- 上传 ----
// 传入 sha 时更新已有文件（覆盖），否则创建新文件
export async function uploadBoard(config, name, html, sha) {
  const body = {
    message: 'Update whiteboard via GMNotes',
    content: utf8ToBase64(html)
  };
  if (sha) body.sha = sha;
  return githubFetch(config, apiBase(config) + '/' + boardPath(name), {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/** 从 GitHub Contents API 写入响应中提取新文件 sha。
 * 响应中 sha 嵌套在 content.sha 下（顶层无 sha），用于保存后更新本地记录的 sha 以支持后续覆盖。 */
export function newFileSha(res) {
  return res && res.content && res.content.sha ? res.content.sha : null;
}

/** PUT 覆盖文件；若 GitHub 因 sha 过期拒绝（409 sha 不匹配 / 422），重新拉取最新 sha 后重试一次。
 * uploadFn 为 uploadBoard（html），签名统一为 (config, name, content, sha)。 */
export async function uploadBoardWithShaRetry(config, name, content, sha, uploadFn) {
  try {
    return await uploadFn(config, name, content, sha);
  } catch (e) {
    const msg = String((e && e.message) || '');
    if (!/sha|409|conflict|422/i.test(msg)) throw e;
    console.warn('[board save] 覆盖被拒绝（sha 过期），重取最新 sha 重试', name, msg);
    const fresh = await getBoardFile(config, name).catch(() => null);
    if (!fresh) throw e;
    return uploadFn(config, name, content, fresh.sha);
  }
}

// 读取白板文件；返回 { sha, html }，用于加载与覆盖更新
export async function getBoardFile(config, name) {
  const data = await githubFetch(config, apiBase(config) + '/' + boardPath(name));
  return {
    sha: data.sha,
    html: typeof data.content === 'string' ? base64ToUtf8(data.content) : ''
  };
}

// ---- 白板 html blob 缓存（预览内嵌 iframe 用） ----
const MAX_BOARD_HTML_CACHE = 20;
const boardHtmlBlobCache = new Map(); // rawUrl -> blobUrl
const boardHtmlInflight = new Map(); // rawUrl -> Promise<blobUrl>

/** 拉取白板 html 并生成 text/html blob URL（带缓存与并发去重）；非白板 URL 返回 null */
export async function getBoardHtmlBlobUrl(config, rawUrl) {
  if (boardHtmlBlobCache.has(rawUrl)) return boardHtmlBlobCache.get(rawUrl);
  if (boardHtmlInflight.has(rawUrl)) return boardHtmlInflight.get(rawUrl);
  const name = boardNameFromUrl(rawUrl);
  if (!name || !rawUrlToPath(config, rawUrl)) return null;
  const p = (async () => {
    const file = await getBoardFile(config, name);
    const url = URL.createObjectURL(new Blob([file.html], { type: 'text/html' }));
    // 拉取期间若已被 invalidate（如保存刷新），不得把旧内容回填缓存，释放新 blob 即可
    if (boardHtmlInflight.get(rawUrl) !== p) {
      URL.revokeObjectURL(url);
      return url;
    }
    boardHtmlBlobCache.set(rawUrl, url);
    if (boardHtmlBlobCache.size > MAX_BOARD_HTML_CACHE) {
      const oldest = boardHtmlBlobCache.keys().next().value;
      URL.revokeObjectURL(boardHtmlBlobCache.get(oldest));
      boardHtmlBlobCache.delete(oldest);
    }
    return url;
  })();
  boardHtmlInflight.set(rawUrl, p);
  try {
    return await p;
  } finally {
    boardHtmlInflight.delete(rawUrl);
  }
}

/** 使白板 html 的 blob 缓存失效（保存覆盖后调用，预览 iframe 才会重拉新内容） */
export function invalidateBoardHtmlBlob(rawUrl) {
  const url = boardHtmlBlobCache.get(rawUrl);
  if (url) {
    URL.revokeObjectURL(url);
    boardHtmlBlobCache.delete(rawUrl);
  }
  boardHtmlInflight.delete(rawUrl);
}

/** 内嵌 iframe（禁止拖拽）+ 打开链接的 markdown */
export function boardIframeMarkdown(url, title) {
  return `<iframe src="${url}" draggable="false"></iframe>\n\n[✏️ ${title}](${url})`;
}