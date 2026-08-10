// @vitest-environment jsdom
// PreviewPane 白板 iframe 内嵌：预览时把 raw URL 替换为 blob URL；保存后刷新
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

const boardCtx = vi.hoisted(() => ({ openViewer: vi.fn(), lastSavedBoard: null }));
const { getBoardHtmlBlobUrlMock } = vi.hoisted(() => ({ getBoardHtmlBlobUrlMock: vi.fn() }));

vi.mock('../src/lib/boardApi.js', () => ({
  BOARD_DIR: 'whiteboards',
  getBoardHtmlBlobUrl: getBoardHtmlBlobUrlMock
}));
vi.mock('../src/lib/imageApi.js', () => ({
  getBlobUrlForRaw: vi.fn(async () => null)
}));
vi.mock('../src/contexts/GitHubConfigContext.jsx', () => ({
  useGitHubConfig: () => ({
    githubConfigRef: { current: { owner: 'owner', repo: 'repo', token: 't' } },
    githubReady: true,
    configVersion: 0
  })
}));
vi.mock('../src/contexts/BoardContext.jsx', () => ({
  useBoard: () => boardCtx
}));

import { PreviewPane } from '../src/components/PreviewPane.jsx';

const RAW = 'https://raw.githubusercontent.com/owner/repo/main/whiteboards/x.html';
const html = `<iframe src="${RAW}"></iframe>`;

beforeEach(() => {
  getBoardHtmlBlobUrlMock.mockReset();
  boardCtx.lastSavedBoard = null;
});
afterEach(() => cleanup());

describe('PreviewPane iframe 内嵌', () => {
  it('预览时把白板 iframe 的 src 替换为 blob URL（且仅匹配本仓库白板）', async () => {
    getBoardHtmlBlobUrlMock.mockResolvedValue('blob:board-1');
    render(<PreviewPane html={html} />);
    await waitFor(() => expect(getBoardHtmlBlobUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'owner', repo: 'repo' }),
      RAW
    ));
    const frame = document.querySelector('iframe');
    await waitFor(() => expect(frame.src).toBe('blob:board-1'));
  });

  it('保存通知（lastSavedBoard.boardRawUrl 匹配）后重新拉取并替换为最新 blob', async () => {
    getBoardHtmlBlobUrlMock.mockResolvedValueOnce('blob:board-1');
    const { rerender } = render(<PreviewPane html={html} />);
    await waitFor(() => expect(document.querySelector('iframe').src).toBe('blob:board-1'));

    // 模拟保存：缓存失效 + notify
    getBoardHtmlBlobUrlMock.mockResolvedValueOnce('blob:board-2');
    boardCtx.lastSavedBoard = { boardRawUrl: RAW };
    rerender(<PreviewPane html={html} />);
    await waitFor(() => expect(document.querySelector('iframe').src).toBe('blob:board-2'));
    expect(getBoardHtmlBlobUrlMock).toHaveBeenCalledTimes(2);
  });

  it('非本仓库 iframe 不替换；已 blob: 的 iframe 不重复拉取', async () => {
    getBoardHtmlBlobUrlMock.mockResolvedValue('blob:board-1');
    render(<PreviewPane html={html + '<iframe src="https://other.com/whiteboards/y.html"></iframe><iframe src="blob:already"></iframe>'} />);
    await waitFor(() => expect(document.querySelectorAll('iframe')[0].src).toBe('blob:board-1'));
    // 非本仓库 URL：从未被处理（src 保持原样），getBoardHtmlBlobUrl 未被调用
    expect(document.querySelectorAll('iframe')[1].src).toBe('https://other.com/whiteboards/y.html');
    expect(getBoardHtmlBlobUrlMock).toHaveBeenCalledTimes(1);
  });

  it('保存后新 blob 先返回时，初始拉取的旧 blob 不覆盖新 blob（竞态防护）', async () => {
    let resolveA, resolveB;
    const pA = new Promise((r) => { resolveA = r; }); // 1c 初始拉取
    const pB = new Promise((r) => { resolveB = r; }); // 1d 保存后拉取
    getBoardHtmlBlobUrlMock
      .mockImplementationOnce(() => pA)
      .mockImplementationOnce(() => pB);
    const { rerender } = render(<PreviewPane html={html} />);
    // 模拟保存：缓存失效 + notify（触发 1d 重新拉取）
    boardCtx.lastSavedBoard = { boardRawUrl: RAW };
    rerender(<PreviewPane html={html} />);
    // 1d 的新内容先返回并生效
    resolveB('blob:board-new');
    await pB; // 1d 的 .then 已执行，src 应为新 blob
    expect(document.querySelector('iframe').src).toBe('blob:board-new');
    // 1c 的初始旧内容后返回：不得覆盖新 blob
    resolveA('blob:board-old');
    await pA; // 1c 的 .then 已执行（若有竞态此刻已覆盖 src）
    expect(document.querySelector('iframe').src).toBe('blob:board-new');
  });
});
