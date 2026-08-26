// @vitest-environment jsdom
// deleteNote 删除确认：点击删除必须先经过 window.confirm，取消则不执行删除
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const api = vi.hoisted(() => ({
  syncIndex: vi.fn(),
  saveIndex: vi.fn(),
  saveNoteFile: vi.fn(),
  deleteNoteFile: vi.fn(),
  loadNoteContent: vi.fn()
}));

vi.mock('../src/lib/githubApi.js', () => api);
vi.mock('../src/contexts/GitHubConfigContext.jsx', () => ({
  useGitHubConfig: () => ({
    githubConfigRef: { current: { token: 't', owner: 'o', repo: 'r', path: '' } },
    githubReady: true,
    currentDir: ''
  })
}));
vi.mock('../src/contexts/ToastContext.jsx', () => ({
  useToast: () => ({ showToast: vi.fn(), toast: { show: false, message: '', type: 'info' }, dismissToast: vi.fn() })
}));

import { I18nProvider } from '../src/contexts/I18nContext.jsx';
import { NotesProvider, useNotes } from '../src/contexts/NotesContext.jsx';

const NOTES = [
  { id: 'n1', title: 'Note 1', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'n2', title: 'Note 2', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

function Probe() {
  const { notes, deleteNote, syncFromGitHub } = useNotes();
  return (
    <div>
      <span data-testid="count">{notes.length}</span>
      <button data-testid="sync" onClick={() => syncFromGitHub()}>sync</button>
      <button data-testid="del-first" onClick={() => deleteNote(notes[0])}>del</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <I18nProvider>
      <NotesProvider>
        <Probe />
      </NotesProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  api.syncIndex.mockReset();
  api.saveIndex.mockReset();
  api.saveNoteFile.mockReset();
  api.deleteNoteFile.mockReset();
  api.loadNoteContent.mockReset();
  api.syncIndex.mockResolvedValue({ sha: 'sha-1', notes: NOTES });
  api.saveIndex.mockResolvedValue('sha-2');
  api.deleteNoteFile.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('deleteNote 删除确认', () => {
  it('取消确认时不做任何删除', async () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('sync'));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByTestId('del-first'));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(api.deleteNoteFile).not.toHaveBeenCalled();
    expect(api.saveIndex).not.toHaveBeenCalled();
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('确认后才执行删除，且确认文案包含笔记标题', async () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('sync'));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('del-first'));

    await waitFor(() => expect(api.deleteNoteFile).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledWith('Note deletion cannot be undone. Delete? \nNote: Note 1');
    expect(api.deleteNoteFile).toHaveBeenCalledWith(expect.anything(), 'n1', '');
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });
});
