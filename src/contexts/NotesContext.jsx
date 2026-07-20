// NotesContext：笔记状态、CRUD、sync、防抖保存（核心）
import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { useGitHubConfig } from './GitHubConfigContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import * as githubApi from '../lib/githubApi';
import { generateId } from '../lib/generateId';
import { MOBILE_BREAKPOINT } from '../constants';

const NotesContext = createContext(null);

export function NotesProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { githubConfigRef, githubReady } = useGitHubConfig();

  const [notes, setNotes] = useState([]);
  const [noteContents, setNoteContents] = useState({});
  const [currentNote, setCurrentNote] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  // 不应触发渲染的引用数据
  const indexShaRef = useRef(null);
  // 同步锁，防止 sync 重入
  const syncingRef = useRef(false);

  // ---- 防抖保存 ----
  const doSaveRef = useRef(async () => {});
  const debounced = useDebouncedSave(() => doSaveRef.current());

  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(n => (n.title || '').toLowerCase().includes(q));
  }, [notes, searchQuery]);

  // ---- Sync ----
  const syncFromGitHub = useCallback(async () => {
    if (!githubReady) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    const config = githubConfigRef.current;
    try {
      const result = await githubApi.syncIndex(config);
      indexShaRef.current = result.sha;
      setNotes(result.notes);
      // 保留当前笔记选择
      setCurrentNote(prev => {
        if (!prev) return null;
        const found = result.notes.find(n => n.id === prev.id);
        if (found) {
          // 触发内容加载（若未缓存）
          if (noteContents[found.id] === undefined) {
            githubApi.loadNoteContent(config, found.id)
              .then(c => setNoteContents(prev => ({ ...prev, [found.id]: c })))
              .catch(() => setNoteContents(prev => ({ ...prev, [found.id]: '' })));
          }
          return found;
        }
        return null;
      });
      showToast(t('toast.sync_complete'), 'success');
    } catch (e) {
      const msg = e.message || '';
      // 任何同步失败都清空列表，防止展示旧配置下的过期数据
      setNotes([]);
      indexShaRef.current = null;
      setNoteContents({});
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        showToast(t('toast.sync.no_notes'), 'info');
      } else if (msg.includes('401')) {
        showToast(t('toast.sync.auth_failed'), 'error');
      } else {
        showToast(t('toast.sync.failed') + msg, 'error');
      }
      console.error('[syncFromGitHub]', e);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [githubReady, githubConfigRef, t, showToast, noteContents]);

  // 监听配置保存事件，自动同步
  useEffect(() => {
    const handler = () => syncFromGitHub();
    window.addEventListener('gmnotes:config-saved', handler);
    return () => window.removeEventListener('gmnotes:config-saved', handler);
  }, [syncFromGitHub]);

  // ---- doSave 实现 ----
  useEffect(() => {
    doSaveRef.current = async () => {
      if (!githubReady || !currentNote) return;
      const config = githubConfigRef.current;
      try {
        await githubApi.saveNoteFile(config, currentNote.id, editingContent);
        // 更新 index 时间戳
        setNotes(prev => {
          const idx = prev.findIndex(n => n.id === currentNote.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              title: editingTitle,
              updatedAt: new Date().toISOString()
            };
            // 写回 GitHub index.json
            githubApi.saveIndex(config, indexShaRef.current, updated, 'Update note via GMNotes')
              .then(newSha => { indexShaRef.current = newSha; })
              .catch(err => {
                console.error('[saveIndex]', err);
                showToast(t('toast.save.failed') + (err.message || ''), 'error');
              });
            return updated;
          }
          return prev;
        });
        showToast(t('toast.save.success'), 'success');
      } catch (e) {
        showToast(t('toast.save.failed') + (e.message || ''), 'error');
        console.error('[doSave]', e);
      }
    };
  }, [githubReady, currentNote, editingContent, editingTitle, githubConfigRef, t, showToast]);

  // ---- 笔记 CRUD ----
  const createNote = useCallback(async () => {
    if (!githubReady) return;
    const config = githubConfigRef.current;
    const note = {
      id: generateId(),
      title: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNotes(prev => [note, ...prev]);
    setNoteContents(prev => ({ ...prev, [note.id]: '' }));
    setEditingTitle('');
    setEditingContent('');
    setCurrentNote(note);
    try {
      await githubApi.saveNoteFile(config, note.id, '');
      const newNotes = [note, ...notes];
      const newSha = await githubApi.saveIndex(config, indexShaRef.current, newNotes, 'Create note via GMNotes');
      indexShaRef.current = newSha;
      showToast(t('toast.note_created'), 'success');
    } catch (e) {
      showToast(t('toast.note_create_failed') + (e.message || ''), 'error');
      console.error('[createNote]', e);
    }
  }, [githubReady, githubConfigRef, notes, t, showToast]);

  const selectNote = useCallback(async (note) => {
    setCurrentNote(note);
    setEditingTitle(note.title);
    if (noteContents[note.id] !== undefined) {
      setEditingContent(noteContents[note.id] || '');
    } else {
      setEditingContent('');
      const config = githubConfigRef.current;
      try {
        const content = await githubApi.loadNoteContent(config, note.id);
        // 仍选中当前 note 才更新
        setCurrentNote(cur => {
          if (cur && cur.id === note.id) {
            setEditingContent(content);
          }
          return cur;
        });
        setNoteContents(prev => ({ ...prev, [note.id]: content }));
      } catch (e) {
        setNoteContents(prev => ({ ...prev, [note.id]: '' }));
        console.error('[loadNoteContent]', e);
      }
    }
    // 移动端关闭 sidebar
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      window.dispatchEvent(new CustomEvent('gmnotes:close-sidebar'));
    }
  }, [noteContents, githubConfigRef]);

  const onTitleChange = useCallback((value) => {
    if (!currentNote) return;
    setEditingTitle(value);
    // 同步更新 notes 中对应项
    setNotes(prev => prev.map(n =>
      n.id === currentNote.id
        ? { ...n, title: value, updatedAt: new Date().toISOString() }
        : n
    ));
    debounced.scheduleSave();
  }, [currentNote, debounced]);

  const onContentChange = useCallback((value) => {
    if (!currentNote) return;
    setEditingContent(value);
    setNoteContents(prev => ({ ...prev, [currentNote.id]: value }));
    // 更新时间戳
    setNotes(prev => prev.map(n =>
      n.id === currentNote.id
        ? { ...n, updatedAt: new Date().toISOString() }
        : n
    ));
    debounced.scheduleSave();
  }, [currentNote, debounced]);

  const deleteNote = useCallback(async (note) => {
    const config = githubConfigRef.current;
    // 从列表移除
    let nextNotes = [];
    let nextCurrent = null;
    let nextTitle = '';
    let nextContent = '';
    setNotes(prev => {
      const idx = prev.findIndex(n => n.id === note.id);
      if (idx === -1) { nextNotes = prev; return prev; }
      nextNotes = [...prev];
      nextNotes.splice(idx, 1);
      return nextNotes;
    });
    setNoteContents(prev => {
      const cp = { ...prev };
      delete cp[note.id];
      return cp;
    });
    setCurrentNote(cur => {
      if (cur && cur.id === note.id) {
        // 选下一项
        const idx = notes.findIndex(n => n.id === note.id);
        nextCurrent = nextNotes.length > 0 ? nextNotes[Math.max(0, idx - 1)] : null;
        if (nextCurrent) {
          nextTitle = nextCurrent.title;
          nextContent = noteContents[nextCurrent.id] !== undefined
            ? (noteContents[nextCurrent.id] || '')
            : '';
          // 触发未缓存内容的加载
          if (noteContents[nextCurrent.id] === undefined) {
            githubApi.loadNoteContent(config, nextCurrent.id)
              .then(c => setNoteContents(p => ({ ...p, [nextCurrent.id]: c })))
              .catch(() => setNoteContents(p => ({ ...p, [nextCurrent.id]: '' })));
          }
        }
        return nextCurrent;
      }
      return cur;
    });
    setEditingTitle(nextTitle);
    setEditingContent(nextContent);
    try {
      await githubApi.deleteNoteFile(config, note.id);
      const newSha = await githubApi.saveIndex(config, indexShaRef.current, nextNotes, 'Delete note via GMNotes');
      indexShaRef.current = newSha;
      showToast(t('toast.note_deleted'), 'info');
    } catch (e) {
      showToast(t('toast.note_delete_failed') + (e.message || ''), 'error');
      console.error('[deleteNote]', e);
    }
  }, [githubConfigRef, notes, noteContents, t, showToast]);

  // ---- AI 插入用：直接覆盖 editingContent ----
  const insertContent = useCallback((newContent, mode) => {
    if (!currentNote) return;
    let updated = newContent;
    const textarea = document.querySelector('.editor-pane');
    switch (mode) {
      case 'replace':
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          updated = editingContent.substring(0, start) + newContent + editingContent.substring(end);
        } else {
          updated = newContent;
        }
        break;
      case 'cursor':
        if (textarea) {
          const pos = textarea.selectionStart;
          updated = editingContent.substring(0, pos) + newContent + editingContent.substring(pos);
        } else {
          updated = editingContent + newContent;
        }
        break;
      case 'replaceAll':
        updated = newContent;
        break;
      case 'append':
        updated = editingContent + '\n\n' + newContent;
        break;
      default:
        updated = newContent;
    }
    setEditingContent(updated);
    setNoteContents(prev => ({ ...prev, [currentNote.id]: updated }));
    setNotes(prev => prev.map(n =>
      n.id === currentNote.id
        ? { ...n, updatedAt: new Date().toISOString() }
        : n
    ));
    debounced.scheduleSave();
  }, [currentNote, editingContent, debounced]);

  const value = useMemo(() => ({
    notes, currentNote,
    editingTitle, editingContent,
    noteContents, syncing,
    searchQuery, setSearchQuery,
    filteredNotes,
    selectNote, createNote, deleteNote,
    onTitleChange, onContentChange,
    syncFromGitHub,
    insertContent,
    indexShaRef,
    setEditingContent
  }), [notes, currentNote, editingTitle, editingContent, noteContents, syncing,
      searchQuery, filteredNotes, selectNote, createNote, deleteNote,
      onTitleChange, onContentChange, syncFromGitHub, insertContent]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
}
