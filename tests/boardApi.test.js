// boardApi 纯函数测试：HTML 生成 / JSON 提取 / 文件名 / URL 构造
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock 网络分支获取，隔离纯函数逻辑
vi.mock('../src/lib/imageApi.js', () => ({
  getDefaultBranch: vi.fn(async () => 'main'),
  rawUrlToPath: (config, rawUrl) => {
    const prefix = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/`;
    if (!rawUrl || !rawUrl.startsWith(prefix)) return null;
    const parts = rawUrl.slice(prefix.length).split('/');
    if (parts.length < 2) return null;
    return parts.slice(1).join('/');
  }
}));

// mock GitHub API 网络调用，验证请求体构造（vi.hoisted 避免提升问题）
const { githubFetchMock } = vi.hoisted(() => ({
  githubFetchMock: vi.fn(async () => ({ ok: true }))
}));
vi.mock('../src/lib/githubApi.js', () => ({
  githubFetch: githubFetchMock,
  apiBase: (config) => `https://api.github.com/repos/${config.owner}/${config.repo}/contents`
}));

import {
  boardName,
  buildBoardHtml,
  extractSnapshot,
  boardRawUrl,
  getBoardRawUrl,
  BOARD_DIR,
  boardPath,
  boardNameFromUrl,
  uploadBoard,
  getBoardFile,
  newFileSha,
  boardIframeMarkdown,
  getBoardHtmlBlobUrl,
  invalidateBoardHtmlBlob
} from '../src/lib/boardApi.js';

// node 环境没有 URL.createObjectURL，用全局 stub 模拟 blob URL
beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:board-' + Math.random()),
    revokeObjectURL: vi.fn()
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('boardName', () => {
  it('生成带 .html 后缀且含时间戳的文件名', () => {
    const name = boardName();
    expect(name).toMatch(/^\d{8}_\d{6}_\d{3}\.html$/);
  });

  it('连续调用产生不同名字', () => {
    const a = boardName();
    const b = boardName();
    expect(a).not.toBe(b);
  });
});

describe('buildBoardHtml', () => {
  it('生成包含 quickdraw 引导代码的静态 HTML', () => {
    const html = buildBoardHtml({ shapes: [], version: 1 });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('createQuickdraw');
  });

  it('将 snapshot JSON 嵌入 HTML', () => {
    const snapshot = { shapes: [{ id: 'a', type: 'pen' }] };
    const html = buildBoardHtml(snapshot);
    expect(html).toContain('"shapes"');
    expect(html).toContain('"id":"a"');
  });

  it('JSON 中的 </script> 被转义，不会截断 HTML', () => {
    const snapshot = { text: '</script><script>alert(1)</script>' };
    const html = buildBoardHtml(snapshot);
    // 转义后不应出现裸的 </script>（闭合标签除外）
    const body = html.split('</script>').slice(0, -1).join('');
    expect(body).not.toContain('</script>');
  });

  it('独立页包含 quickdraw.css 与容器尺寸样式（否则 iframe 内画布塌缩为 0，图形不可见）', () => {
    const html = buildBoardHtml({ shapes: [] });
    expect(html).toContain('https://esm.sh/@quickdrawjs/core@0.2.0/quickdraw.css');
    expect(html).toContain('html, body { margin: 0; height: 100%; }');
    expect(html).toContain('#board { width: 100%; height: 100%; }');
  });

  it('独立页以只读方式创建（隐藏工具栏与水印），避免内嵌 iframe 出现可编辑却无法保存的困惑', () => {
    const html = buildBoardHtml({ shapes: [] });
    expect(html).toContain('hideUi: true');
    expect(html).toContain('watermark: false');
  });
});

describe('extractSnapshot', () => {
  it('从生成的 HTML 中还原 snapshot', () => {
    const snapshot = { shapes: [{ id: 'a', type: 'rect', x: 1 }], meta: { n: 2 } };
    const html = buildBoardHtml(snapshot);
    const restored = extractSnapshot(html);
    expect(restored).toEqual(snapshot);
  });

  it('处理包含特殊字符（引号/换行/<script>标签）的 snapshot', () => {
    const snapshot = {
      text: 'say "hi"\n下一行',
      evil: '</script><script>alert(1)</script>',
      tricky: '}; break; // 类似闭合序列'
    };
    const html = buildBoardHtml(snapshot);
    const restored = extractSnapshot(html);
    expect(restored).toEqual(snapshot);
  });

  it('对不含白板数据的 HTML 返回 null', () => {
    expect(extractSnapshot('<html><body>no board</body></html>')).toBeNull();
  });
});

describe('boardRawUrl', () => {
  it('构造 raw.githubusercontent.com 的 whiteboards 路径', () => {
    const config = { owner: 'alice', repo: 'notes' };
    expect(boardRawUrl(config, 'main', '20260101_000000_000.html')).toBe(
      'https://raw.githubusercontent.com/alice/notes/main/whiteboards/20260101_000000_000.html'
    );
  });

  it('getBoardRawUrl 委托 getDefaultBranch 获取分支后构造一致路径', async () => {
    const config = { owner: 'alice', repo: 'notes' };
    const url = await getBoardRawUrl(config, '20260101_000000_000.html');
    expect(url).toBe(
      'https://raw.githubusercontent.com/alice/notes/main/whiteboards/20260101_000000_000.html'
    );
  });
});

describe('BOARD_DIR', () => {
  it('白板保存在 whiteboards 目录', () => {
    expect(BOARD_DIR).toBe('whiteboards');
  });
});

describe('boardNameFromUrl', () => {
  it('从 raw URL 提取 whiteboards 文件名', () => {
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/20260101_000000_000.html';
    expect(boardNameFromUrl(url)).toBe('20260101_000000_000.html');
  });

  it('对非白板 URL 返回 null', () => {
    expect(boardNameFromUrl('https://example.com/foo.html')).toBeNull();
    expect(boardNameFromUrl('https://raw.githubusercontent.com/alice/notes/main/images/a.png')).toBeNull();
  });
});

describe('boardPath', () => {
  it('构造 whiteboards/ 下路径', () => {
    expect(boardPath('x.html')).toBe('whiteboards/x.html');
  });
});

describe('uploadBoard', () => {
  it('PUT 到 whiteboards/{name}，body 含 base64 内容', async () => {
    githubFetchMock.mockClear();
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const html = '<html>hi</html>';
    await uploadBoard(config, 'x.html', html);
    const [, url, options] = githubFetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/alice/notes/contents/whiteboards/x.html');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body);
    expect(body.message).toContain('whiteboard');
    expect(body.content).toBe(Buffer.from(html).toString('base64'));
    expect(body.sha).toBeUndefined();
  });

  it('传入 sha 时用于覆盖（更新已有文件）', async () => {
    githubFetchMock.mockClear();
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    await uploadBoard(config, 'x.html', '<html></html>', 'abc123');
    const [, , options] = githubFetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.sha).toBe('abc123');
  });
});

describe('getBoardFile', () => {
  it('GET 返回 { sha, html }（解码 base64 内容）', async () => {
    githubFetchMock.mockClear().mockResolvedValueOnce({
      sha: 'abc',
      content: Buffer.from('<html>hello</html>').toString('base64')
    });
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const file = await getBoardFile(config, 'x.html');
    const [, url] = githubFetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/alice/notes/contents/whiteboards/x.html');
    expect(file.sha).toBe('abc');
    expect(file.html).toBe('<html>hello</html>');
  });
});

describe('newFileSha', () => {
  it('从 GitHub Contents API 写入响应提取新 sha（嵌套在 content.sha 下，顶层无 sha）', () => {
    const res = { content: { sha: 'abc123' }, commit: {} };
    expect(newFileSha(res)).toBe('abc123');
  });

  it('响应缺少 sha 时返回 null', () => {
    expect(newFileSha({ content: {} })).toBeNull();
    expect(newFileSha({})).toBeNull();
    expect(newFileSha(null)).toBeNull();
    expect(newFileSha(undefined)).toBeNull();
  });
});

describe('boardIframeMarkdown', () => {
  it('生成 iframe + 打开链接的 markdown', () => {
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/x.html';
    expect(boardIframeMarkdown(url, 'x')).toBe(
      `<iframe src="${url}"></iframe>\n\n[✏️ x](${url})`
    );
  });
});

describe('getBoardHtmlBlobUrl / invalidateBoardHtmlBlob', () => {
  it('拉取白板 html 生成 text/html blob URL，并缓存复用', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/x.html';
    githubFetchMock.mockClear().mockResolvedValueOnce({
      sha: 'abc', content: Buffer.from('<html>board</html>').toString('base64')
    });
    const first = await getBoardHtmlBlobUrl(config, url);
    const second = await getBoardHtmlBlobUrl(config, url); // 命中缓存
    expect(second).toBe(first);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = URL.createObjectURL.mock.calls[0][0];
    expect(blobArg.type).toBe('text/html');
  });

  it('invalidate 后重新拉取并生成新 blob', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/x.html';
    githubFetchMock.mockClear().mockResolvedValueOnce({
      sha: 'a', content: Buffer.from('old').toString('base64')
    });
    const first = await getBoardHtmlBlobUrl(config, url);
    invalidateBoardHtmlBlob(url);
    githubFetchMock.mockResolvedValueOnce({
      sha: 'b', content: Buffer.from('new').toString('base64')
    });
    const second = await getBoardHtmlBlobUrl(config, url);
    expect(second).not.toBe(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
  });

  it('非本仓库 URL 返回 null', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://other.com/whiteboards/x.html';
    expect(await getBoardHtmlBlobUrl(config, url)).toBeNull();
  });

  it('并发调用同一 URL 只拉取一次（inflight 去重，不产生孤儿 blob）', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/dedup.html';
    githubFetchMock.mockClear().mockResolvedValueOnce({
      sha: 'abc', content: Buffer.from('<html>b</html>').toString('base64')
    });
    const [a, b] = await Promise.all([
      getBoardHtmlBlobUrl(config, url),
      getBoardHtmlBlobUrl(config, url)
    ]);
    expect(a).toBe(b); // 同一个 blob URL
    expect(githubFetchMock).toHaveBeenCalledTimes(1); // 只拉取一次
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('本仓库但非 whiteboards/ 的 URL 返回 null 且不发请求', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://raw.githubusercontent.com/alice/notes/main/images/a.png';
    githubFetchMock.mockClear();
    expect(await getBoardHtmlBlobUrl(config, url)).toBeNull();
    expect(githubFetchMock).not.toHaveBeenCalled();
  });

  it('拉取期间被 invalidate 时，不把旧内容回填缓存（防保存刷新读到旧 blob）', async () => {
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const url = 'https://raw.githubusercontent.com/alice/notes/main/whiteboards/race.html';
    let resolveFetch;
    githubFetchMock.mockClear().mockReturnValueOnce(new Promise(res => { resolveFetch = res; }));
    const pending = getBoardHtmlBlobUrl(config, url); // 拉取挂起中
    invalidateBoardHtmlBlob(url);                     // 保存刷新：清掉 inflight 与缓存
    resolveFetch({ sha: 'old', content: Buffer.from('old').toString('base64') });
    const staleUrl = await pending;
    // 旧内容不得回填缓存：再次调用应重新拉取（不同 URL），且旧 blob 被释放
    githubFetchMock.mockResolvedValueOnce({
      sha: 'new', content: Buffer.from('new').toString('base64')
    });
    const freshUrl = await getBoardHtmlBlobUrl(config, url);
    expect(freshUrl).not.toBe(staleUrl);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(staleUrl);
  });
});