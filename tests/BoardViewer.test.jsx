// @vitest-environment jsdom
// BoardViewer handleSave 行为测试：
// 1) 保存时必须带 load 拿到的 sha 覆盖 html（否则 GitHub 拒绝覆盖）
// 2) 保存成功后必须通知预览刷新内嵌 iframe（notifyBoardSaved + invalidateBoardHtmlBlob）
// 3) html PUT 遇 409（sha 过期）时自动重取 sha 重试一次
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ---- mock 网络层（githubApi），boardApi 走真实逻辑 ----
const { githubFetchMock } = vi.hoisted(() => ({
  githubFetchMock: vi.fn()
}));
vi.mock('../src/lib/githubApi.js', () => ({
  githubFetch: githubFetchMock,
  apiBase: (config) => `https://api.github.com/repos/${config.owner}/${config.repo}/contents`,
  githubDelete: vi.fn()
}));

// ---- spy invalidateBoardHtmlBlob（boardApi 其余走真实逻辑） ----
const { invalidateBoardHtmlMock } = vi.hoisted(() => ({ invalidateBoardHtmlMock: vi.fn() }));
vi.mock('../src/lib/boardApi.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, invalidateBoardHtmlBlob: invalidateBoardHtmlMock };
});

// ---- mock context ----
const boardCtx = vi.hoisted(() => ({
  viewer: null,
  closeViewer: vi.fn(),
  notifyBoardSaved: vi.fn()
}));
const toastCtx = vi.hoisted(() => ({ showToast: vi.fn() }));
const githubCtx = vi.hoisted(() => ({
  githubConfigRef: { current: { owner: 'owner', repo: 'repo', token: 't' } }
}));
vi.mock('../src/contexts/BoardContext.jsx', () => ({
  useBoard: () => boardCtx
}));
vi.mock('../src/contexts/ToastContext.jsx', () => ({
  useToast: () => toastCtx
}));
vi.mock('../src/contexts/I18nContext.jsx', () => ({
  useI18n: () => ({ t: (k) => k })
}));
vi.mock('../src/contexts/GitHubConfigContext.jsx', () => ({
  useGitHubConfig: () => githubCtx
}));

// ---- mock Quickdraw：暴露 fake editor（无 exportImage——缩略图管线已废弃） ----
vi.mock('@quickdrawjs/react', async () => {
  const ReactActual = await import('react');
  const Quickdraw = ReactActual.forwardRef(function Quickdraw(_props, ref) {
    ReactActual.useLayoutEffect(() => {
      if (ref) {
        ref.current = {
          editor: {
            store: { getSnapshot: () => ({ shapes: [] }) }
          }
        };
      }
    }, [ref]);
    return ReactActual.createElement('div', { 'data-testid': 'quickdraw' });
  });
  return { Quickdraw };
});

import { BoardViewer } from '../src/components/boards/BoardViewer.jsx';
import { buildBoardHtml } from '../src/lib/boardApi.js';

const BOARD_URL = 'https://raw.githubusercontent.com/owner/repo/main/whiteboards/20260810_120000_000.html';

function installGithubMock() {
  githubFetchMock.mockImplementation(async (_config, url, options = {}) => {
    if (options.method === 'PUT') return { content: { sha: 'html-sha-2' } };
    if (url.endsWith('/repos/owner/repo')) return { default_branch: 'main' };
    return { sha: 'html-sha-1', content: Buffer.from(buildBoardHtml({ shapes: [] })).toString('base64') };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  boardCtx.viewer = { url: BOARD_URL, title: '板' };
  boardCtx.closeViewer = vi.fn();
  boardCtx.notifyBoardSaved = vi.fn();
  toastCtx.showToast = vi.fn();
  invalidateBoardHtmlMock.mockClear();
  installGithubMock();
});

afterEach(() => {
  cleanup();
});

describe('BoardViewer handleSave', () => {
  it('保存时用 load 拿到的 sha 覆盖 html（PUT body 带 sha），不再上传缩略图', async () => {
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());
    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    const htmlPut = puts.find(([, url]) => url.includes('.html'));
    expect(htmlPut).toBeTruthy();
    expect(JSON.parse(htmlPut[2].body).sha).toBe('html-sha-1');
    expect(puts.some(([, url]) => url.includes('.png'))).toBe(false);
  });

  it('保存后通知预览刷新内嵌 iframe（notifyBoardSaved + invalidateBoardHtmlBlob）', async () => {
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.notifyBoardSaved).toHaveBeenCalled());
    expect(boardCtx.notifyBoardSaved).toHaveBeenCalledWith({ boardRawUrl: BOARD_URL });
    expect(invalidateBoardHtmlMock).toHaveBeenCalledWith(BOARD_URL);
    expect(boardCtx.closeViewer).toHaveBeenCalled();
  });

  it('html PUT 遇 409（sha 不匹配）时重新拉取最新 sha 并重试一次', async () => {
    let htmlPutCount = 0;
    let getCount = 0;
    githubFetchMock.mockImplementation(async (_c, url, options = {}) => {
      if (options.method === 'PUT') {
        htmlPutCount++;
        if (htmlPutCount === 1) throw new Error("sha doesn't match the expected value (409)");
        return { content: { sha: 'html-sha-2' } };
      }
      if (url.endsWith('/repos/owner/repo')) return { default_branch: 'main' };
      // load 时拿到旧 sha；409 后重取时返回更新的 sha
      getCount++;
      const sha = getCount === 1 ? 'html-sha-1' : 'html-sha-fresh';
      return { sha, content: Buffer.from(buildBoardHtml({ shapes: [] })).toString('base64') };
    });
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());
    expect(htmlPutCount).toBe(2);
    // 第一次 PUT 用 load 时的 sha
    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    expect(JSON.parse(puts[0][2].body).sha).toBe('html-sha-1');
    // 第二次 PUT 携带重取的最新 sha
    expect(JSON.parse(puts[1][2].body).sha).toBe('html-sha-fresh');
    expect(toastCtx.showToast).not.toHaveBeenCalledWith(expect.stringContaining('save_failed'), 'error');
  });
});
