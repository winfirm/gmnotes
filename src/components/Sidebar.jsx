// Sidebar 整体
import { useNotes } from '../contexts/NotesContext.jsx';
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { SidebarHeader } from './SidebarHeader.jsx';
import { NoteList } from './NoteList.jsx';
import { SidebarOverlay } from './SidebarOverlay.jsx';

export function Sidebar({ open, onClose }) {
  const { syncing, createNote, syncFromGitHub } = useNotes();
  const { githubReady, setShowConfig } = useGitHubConfig();

  const handleSync = () => {
    syncFromGitHub();
    onClose();
  };

  const handleConfig = () => {
    setShowConfig(true);
    onClose();
  };

  return (
    <>
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <SidebarHeader
          onNewNote={createNote}
          onSync={handleSync}
          onOpenConfig={handleConfig}
          syncing={syncing}
          githubReady={githubReady}
        />
        <NoteList />
      </aside>
      <SidebarOverlay visible={open} onClose={onClose} />
    </>
  );
}
