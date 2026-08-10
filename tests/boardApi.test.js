// boardApi 纯函数测试：HTML 生成 / JSON 提取 / 文件名 / URL 构造
import { describe, it, expect, vi } from 'vitest';

// mock 网络分支获取，隔离纯函数逻辑
vi.mock('../src/lib/imageApi.js', () => ({
  getDefaultBranch: vi.fn(async () => 'main')
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
  boardThumbName,
  uploadBoard,
  uploadBoardThumb,
  getBoardFile,
  newFileSha
} from '../src/lib/boardApi.js';

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

describe('boardThumbName', () => {
  it('从 html 文件名派生同名 .png 缩略图名', () => {
    expect(boardThumbName('20260101_000000_000.html'))
      .toBe('20260101_000000_000.png');
  });

  it('对非 .html 文件名返回 null', () => {
    expect(boardThumbName('20260101_000000_000.png')).toBeNull();
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

describe('uploadBoardThumb', () => {
  it('PUT PNG 到 whiteboards/ 下同名文件，body 为 base64 图片', async () => {
    githubFetchMock.mockClear();
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAE='; // 1x1 透明 PNG
    await uploadBoardThumb(config, 'x.png', pngBase64);
    const [, url, options] = githubFetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/alice/notes/contents/whiteboards/x.png');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body);
    expect(body.content).toBe(pngBase64);
    expect(body.sha).toBeUndefined();
  });

  it('传入 sha 时覆盖已有缩略图', async () => {
    githubFetchMock.mockClear();
    const config = { owner: 'alice', repo: 'notes', token: 't' };
    await uploadBoardThumb(config, 'x.png', 'abc', 'sha999');
    const [, , options] = githubFetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.sha).toBe('sha999');
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