// Main 区域容器
import { useI18n } from '../contexts/I18nContext.jsx';
import { useNotes } from '../contexts/NotesContext.jsx';
import { useMarkdownRenderer } from '../hooks/useMarkdownRenderer';
import { EditorPane } from './EditorPane.jsx';
import { PreviewPane } from './PreviewPane.jsx';
import { WelcomeScreen } from './WelcomeScreen.jsx';

export function Main({ onToggleSidebar, previewMode, onTogglePreview, textareaRef }) {
  const { currentNote, editingContent } = useNotes();
  const { locale } = useI18n();
  const html = useMarkdownRenderer(editingContent, locale);

  if (!currentNote) {
    return (
      <main className="main">
        <WelcomeScreen onToggleSidebar={onToggleSidebar} />
      </main>
    );
  }

  return (
    <main className="main">
      <EditorPane
        onToggleSidebar={onToggleSidebar}
        previewMode={previewMode}
        onTogglePreview={onTogglePreview}
        textareaRef={textareaRef}
      />
      {previewMode && (
        <div className="editor-area" style={{ display: 'flex' }}>
          <PreviewPane html={html} />
        </div>
      )}
    </main>
  );
}
