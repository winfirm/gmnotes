// @vitest-environment jsdom
// BoardViewer handleSave 行为测试：
// 1) 保存时必须带 load 时拿到的 sha 覆盖 html 与缩略图（否则 GitHub 拒绝覆盖）
// 2) 缩略图保存成功后必须通知预览刷新（notifyBoardSaved）并失效旧 blob 缓存（invalidateBlobUrl）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// ---- mock 网络层（githubApi），boardApi 走真实逻辑 ----
const { githubFetchMock } = vi.hoisted(() => ({
  githubFetchMock: vi.fn()
}));
vi.mock('../src/lib/githubApi.js', () => ({
  githubFetch: githubFetchMock,
  apiBase: (config) => `https://api.github.com/repos/${config.owner}/${config.repo}/contents`,
  githubDelete: vi.fn()
}));

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

// ---- mock Quickdraw：暴露 fake editor（exportImage 行为可在测试中覆盖） ----
const qdMock = vi.hoisted(() => ({
  exportImage: async () => new Blob(['fake-png'], { type: 'image/png' })
}));
vi.mock('@quickdrawjs/react', async () => {
  const ReactActual = await import('react');
  const Quickdraw = ReactActual.forwardRef(function Quickdraw(_props, ref) {
    ReactActual.useLayoutEffect(() => {
      if (ref) {
        ref.current = {
          editor: {
            store: { getSnapshot: () => ({ shapes: [] }) },
            exportImage: (...args) => qdMock.exportImage(...args)
          }
        };
      }
    }, [ref]);
    return ReactActual.createElement('div', { 'data-testid': 'quickdraw' });
  });
  return { Quickdraw };
});

// ---- mock 图片压缩 ----
vi.mock('../src/lib/imageCompression.js', () => ({
  blobToBase64: vi.fn(async () => 'iVBORw0KGgoAAAANSUhEUgAAAAE=')
}));

// ---- spy invalidateBlobUrl（其余 imageApi 保持真实，boardApi 依赖 getDefaultBranch） ----
const { invalidateMock } = vi.hoisted(() => ({ invalidateMock: vi.fn() }));
vi.mock('../src/lib/imageApi.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, invalidateBlobUrl: invalidateMock };
});

import { BoardViewer } from '../src/components/boards/BoardViewer.jsx';
import { buildBoardHtml } from '../src/lib/boardApi.js';

const BOARD_URL = 'https://raw.githubusercontent.com/owner/repo/main/whiteboards/20260810_120000_000.html';
const THUMB_RAW_URL = 'https://raw.githubusercontent.com/owner/repo/main/whiteboards/20260810_120000_000.png';

// 根据请求 URL/method 返回 GitHub 假响应
function installGithubMock() {
  githubFetchMock.mockImplementation(async (_config, url, options = {}) => {
    if (options.method === 'PUT') {
      if (url.includes('.png')) return { content: { sha: 'thumb-sha-2' } };
      return { content: { sha: 'html-sha-2' } };
    }
    if (url.endsWith('/repos/owner/repo')) return { default_branch: 'main' };
    if (url.includes('.png')) return { sha: 'thumb-sha-1', content: Buffer.from('png').toString('base64') };
    return { sha: 'html-sha-1', content: Buffer.from(buildBoardHtml({ shapes: [] })).toString('base64') };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  boardCtx.viewer = { url: BOARD_URL, title: '板' };
  boardCtx.closeViewer = vi.fn();
  boardCtx.notifyBoardSaved = vi.fn();
  toastCtx.showToast = vi.fn();
  invalidateMock.mockClear();
  qdMock.exportImage = async () => new Blob(['fake-png'], { type: 'image/png' });
  installGithubMock();
  // jsdom 无 URL.createObjectURL，打桩供 handleSave 创建 blob URL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-thumb'),
    revokeObjectURL: vi.fn()
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BoardViewer handleSave', () => {
  it('保存时用 load 拿到的 sha 覆盖 html 与缩略图（PUT body 带 sha）', async () => {
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());

    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    const htmlBody = JSON.parse(puts.find(([, url]) => url.includes('.html'))[2].body);
    const pngBody = JSON.parse(puts.find(([, url]) => url.includes('.png'))[2].body);
    expect(htmlBody.sha).toBe('html-sha-1');
    expect(pngBody.sha).toBe('thumb-sha-1');
  });

  it('缩略图保存成功后通知预览刷新并失效旧 blob 缓存', async () => {
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.notifyBoardSaved).toHaveBeenCalled());
    expect(boardCtx.notifyBoardSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        thumbRawUrl: THUMB_RAW_URL,
        blobUrl: 'blob:mock-thumb'
      })
    );
    expect(invalidateMock).toHaveBeenCalledWith(THUMB_RAW_URL);
    expect(boardCtx.closeViewer).toHaveBeenCalled();
  });

  it('缩略图导出为空时不再静默：提示 toast、不静默跳过，且不阻断 html 保存', async () => {
    qdMock.exportImage = async () => null; // 模拟 exportImage 返回 null（空画布/画布过大）
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    // html 仍保存成功
    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());
    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    expect(puts.some(([, url]) => url.includes('.html'))).toBe(true);
    // 没有 png PUT（导出为空无图可传），但必须明确告警而非静默
    expect(puts.some(([, url]) => url.includes('.png'))).toBe(false);
    expect(toastCtx.showToast).toHaveBeenCalledWith(
      expect.stringContaining('thumb_failed'),
      'error'
    );
  });

  it('缩略图导出过大时降级到 1x 重试，第二次成功则正常上传', async () => {
    const bigBlob = new Blob([new ArrayBuffer(900 * 1024 + 1)], { type: 'image/png' });
    const okBlob = new Blob(['small'], { type: 'image/png' });
    const exportSpy = vi.fn()
      .mockResolvedValueOnce(bigBlob)   // 第一次 scale=2 过大
      .mockResolvedValueOnce(okBlob);   // 第二次 scale=1 成功
    qdMock.exportImage = exportSpy;
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());
    // 两次导出尝试：scale 2 → scale 1
    expect(exportSpy).toHaveBeenCalledTimes(2);
    expect(exportSpy.mock.calls[0][0].scale).toBe(2);
    expect(exportSpy.mock.calls[1][0].scale).toBe(1);
    // 第二次成功后正常 PUT png
    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    expect(puts.some(([, url]) => url.includes('.png'))).toBe(true);
  });

  it('png PUT 遇 409（sha 不匹配）时重新拉取最新 sha 并重试一次，最终保存成功', async () => {
    let pngPutCount = 0;
    githubFetchMock.mockImplementation(async (_c, url, options = {}) => {
      const isPut = options.method === 'PUT';
      if (isPut && url.includes('.png')) {
        pngPutCount++;
        if (pngPutCount === 1) {
          // 模拟浏览器缓存导致 load 拿到的 sha 过期
          throw new Error("sha doesn't match the expected value (409)");
        }
        return { content: { sha: 'thumb-sha-2' } };
      }
      if (isPut) return { content: { sha: 'html-sha-2' } };
      if (url.endsWith('/repos/owner/repo')) return { default_branch: 'main' };
      if (url.includes('.png')) return { sha: 'thumb-sha-fresh', content: 'aGVsbG8=' };
      return { sha: 'html-sha-1', content: Buffer.from(buildBoardHtml({ shapes: [] })).toString('base64') };
    });
    render(<BoardViewer />);
    const saveBtn = screen.getByRole('button', { name: 'board.save' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => expect(boardCtx.closeViewer).toHaveBeenCalled());
    expect(pngPutCount).toBe(2); // 第一次 409 后重试成功
    expect(boardCtx.notifyBoardSaved).toHaveBeenCalled();
    expect(toastCtx.showToast).not.toHaveBeenCalledWith(
      expect.stringContaining('thumb_failed'),
      'error'
    );
  });
});
