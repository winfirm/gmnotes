// 笔记列表 + 搜索
import { useI18n } from '../contexts/I18nContext.jsx';
import { useNotes } from '../contexts/NotesContext.jsx';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { NoteItem } from './NoteItem.jsx';
import { DirTabs } from './DirTabs.jsx';

export function NoteList() {
  const { t } = useI18n();
  const {
    notes, filteredNotes,
    searchQuery, setSearchQuery,
    currentNote, selectNote, deleteNote
  } = useNotes();
  const { githubReady } = useGitHubConfig();

  let emptyText;
  if (!githubReady) emptyText = t('sidebar.empty.no_config');
  else if (notes.length === 0) emptyText = t('sidebar.empty.no_notes');
  else emptyText = t('sidebar.empty.no_match');

  return (
    <>
      <DirTabs />
      <div className="search-box">
        <input
          className="search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('sidebar.search')}
        />
      </div>
      <div className="note-list">
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-text" dangerouslySetInnerHTML={{ __html: emptyText }} />
          </div>
        ) : (
          filteredNotes.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              active={currentNote && currentNote.id === note.id}
              onSelect={selectNote}
              onDelete={deleteNote}
            />
          ))
        )}
      </div>
    </>
  );
}
