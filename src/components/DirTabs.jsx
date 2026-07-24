// 目录标签页组件
import { useGitHubConfig } from '../contexts/GitHubConfigContext.jsx';
import { useNotes } from '../contexts/NotesContext.jsx';
import { parsePath } from '../lib/githubApi';
import { DIR_STORAGE_KEY } from '../constants';

export function DirTabs() {
  const { githubConfigRef, currentDir, setCurrentDir } = useGitHubConfig();
  const { syncFromGitHub, setCurrentNote, setEditingTitle, setEditingContent, setNoteContents } = useNotes();

  const configPath = githubConfigRef.current.path;
  const dirs = parsePath(configPath);

  // 构建标签列表：始终在最前面加 /（根目录），后面跟配置的子目录
  const allTabs = [{ key: '', label: '/' }, ...dirs.map(d => ({ key: d, label: d }))];

  // 无子目录时（仅有 default）不显示标签页
  if (dirs.length === 0) {
    return null;
  }

  const handleDirChange = async (dir) => {
    if (dir === currentDir) return;
    
    // 清空当前状态
    setCurrentNote(null);
    setEditingTitle('');
    setEditingContent('');
    setNoteContents({});
    
    // 更新当前目录
    setCurrentDir(dir);
    try { localStorage.setItem(DIR_STORAGE_KEY, dir); } catch (e) {}
    
    // 重新同步
    await syncFromGitHub(dir);
  };

  return (
    <div className="dir-tabs">
      {allTabs.map(tab => (
        <button
          key={tab.key}
          className={'dir-tab' + (tab.key === currentDir ? ' active' : '')}
          onClick={() => handleDirChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
