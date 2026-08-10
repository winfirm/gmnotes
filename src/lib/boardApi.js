// 白板(quickdraw) API：生成自包含 HTML、上传到 GitHub whiteboards/、读取与提取
import { utf8ToBase64, base64ToUtf8 } from './base64';
import { githubFetch, apiBase } from './githubApi';
import { getDefaultBranch } from './imageApi';

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
</head>
<body>
<div id="board"></div>
<script type="module">
import { createQuickdraw } from 'https://esm.sh/@quickdrawjs/core@0.2.0';
const saved = ${escapeJsonForScript(snapshot || {})};
const board = createQuickdraw({ container: document.getElementById('board') });
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

/** 从 html 白板名派生同名 .png 缩略图名；非 .html 返回 null */
export function boardThumbName(boardFileName) {
  if (!boardFileName || !boardFileName.toLowerCase().endsWith('.html')) return null;
  return boardFileName.slice(0, -5) + '.png';
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

// 上传/覆盖 PNG 缩略图（内容已为 base64）
export async function uploadBoardThumb(config, name, pngBase64, sha) {
  const body = {
    message: 'Update whiteboard thumbnail via GMNotes',
    content: pngBase64
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
 * uploadFn 为 uploadBoard（html）或 uploadBoardThumb（png），签名统一为 (config, name, content, sha)。 */
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