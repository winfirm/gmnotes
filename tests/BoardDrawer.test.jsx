// @vitest-environment jsdom
// BoardDrawer handleInsert：上传 html 后插入 iframe + 打开链接的 markdown
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ---- mock 网络层（githubApi），boardApi 走真实逻辑 ----
const { githubFetchMock } = vi.hoisted(() => ({ githubFetchMock: vi.fn() }));
vi.mock('../src/lib/githubApi.js', () => ({
  githubFetch: githubFetchMock,
  apiBase: (config) => `https://api.github.com/repos/${config.owner}/${config.repo}/contents`,
  githubDelete: vi.fn()
}));

// ---- mock context ----
const boardCtx = vi.hoisted(() => ({ showDraw: true, closeDraw: vi.fn() }));
const notesCtx = vi.hoisted(() => ({ insertContent: vi.fn() }));
const toastCtx = vi.hoisted(() => ({ showToast: vi.fn() }));
const githubCtx = vi.hoisted(() => ({
  githubConfigRef: { current: { owner: 'owner', repo: 'repo', token: 't' } },
  githubReady: true
}));
vi.mock('../src/contexts/BoardContext.jsx', () => ({ useBoard: () => boardCtx }));
vi.mock('../src/contexts/NotesContext.jsx', () => ({ useNotes: () => notesCtx }));
vi.mock('../src/contexts/ToastContext.jsx', () => ({ useToast: () => toastCtx }));
vi.mock('../src/contexts/I18nContext.jsx', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../src/contexts/GitHubConfigContext.jsx', () => ({ useGitHubConfig: () => githubCtx }));

// ---- mock Quickdraw：fake editor（snapshot 非空） ----
vi.mock('@quickdrawjs/react', async () => {
  const ReactActual = await import('react');
  const Quickdraw = ReactActual.forwardRef(function Quickdraw(_props, ref) {
    ReactActual.useLayoutEffect(() => {
      if (ref) {
        ref.current = {
          editor: { store: { getSnapshot: () => ({ shapes: [{}] }) } }
        };
      }
    }, [ref]);
    return ReactActual.createElement('div', { 'data-testid': 'quickdraw' });
  });
  return { Quickdraw };
});

import { BoardDrawer } from '../src/components/boards/BoardDrawer.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  boardCtx.closeDraw = vi.fn();
  notesCtx.insertContent = vi.fn();
  toastCtx.showToast = vi.fn();
  githubFetchMock.mockImplementation(async (_c, url, options = {}) => {
    if (options.method === 'PUT') return { content: { sha: 'x' } };
    if (url.endsWith('/repos/owner/repo')) return { default_branch: 'main' };
    return { sha: 's', content: '' };
  });
});
afterEach(() => cleanup());

describe('BoardDrawer handleInsert', () => {
  it('上传 html 到 whiteboards/ 并插入 iframe + 打开链接的 markdown', async () => {
    render(<BoardDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'board.insert' }));

    await waitFor(() => expect(notesCtx.insertContent).toHaveBeenCalled());

    // 1) html 上传到 whiteboards/{生成名}.html
    const puts = githubFetchMock.mock.calls.filter(([, , o]) => o && o.method === 'PUT');
    expect(puts).toHaveLength(1);
    const putUrl = puts[0][1];
    const nameMatch = putUrl.match(/\/contents\/whiteboards\/(\d{8}_\d{6}_\d{3}\.html)$/);
    expect(nameMatch).toBeTruthy();

    // 2) 插入的 markdown：iframe src 与链接都指向同名 raw URL
    const name = nameMatch[1];
    const url = `https://raw.githubusercontent.com/owner/repo/main/whiteboards/${name}`;
    expect(notesCtx.insertContent).toHaveBeenCalledWith(
      `<iframe src="${url}"></iframe>\n\n[✏️ ${name.replace(/\.html$/, '')}](${url})`,
      'cursor'
    );

    // 3) 不再上传缩略图（无 png PUT）
    expect(puts.some(([, u]) => u.includes('.png'))).toBe(false);
    expect(boardCtx.closeDraw).toHaveBeenCalled();
  });
});
