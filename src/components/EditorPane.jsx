// 编辑器
import { useI18n } from '../contexts/I18nContext.jsx';
import { useNotes } from '../contexts/NotesContext.jsx';
import { useAi } from '../contexts/AiContext.jsx';
import { useImages } from '../contexts/ImageContext.jsx';

export function EditorPane({ onToggleSidebar, previewMode, onTogglePreview, textareaRef }) {
  const { t } = useI18n();
  const { currentNote, editingTitle, editingContent, onTitleChange, onContentChange } = useNotes();
  const { openAiDrawer } = useAi();
  const { openGallery } = useImages();

  if (!currentNote) return null;

  return (
    <>
      <div className="main-header">
        <button
          className="menu-btn"
          onClick={onToggleSidebar}
          title={t('editor.menu.tooltip')}
          aria-label={t('editor.menu.tooltip')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <input
          className="title-input"
          type="text"
          value={editingTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('editor.title_placeholder')}
        />
        {!previewMode && (
          <>
            <button className="btn-ai" onClick={openGallery} title={t('editor.image.tooltip')}>
              🖼
            </button>
            <button className="btn-ai" onClick={openAiDrawer} title={t('editor.ai.tooltip')}>
              AI+
            </button>
          </>
        )}
        <div className="mode-tabs">
          <button
            className={'mode-tab' + (!previewMode ? ' active' : '')}
            onClick={() => onTogglePreview(false)}
          >
            {t('editor.mode.edit')}
          </button>
          <button
            className={'mode-tab' + (previewMode ? ' active' : '')}
            onClick={() => onTogglePreview(true)}
          >
            {t('editor.mode.preview')}
          </button>
        </div>
      </div>
      {!previewMode && (
        <div className="editor-area">
          <textarea
            ref={textareaRef}
            className="editor-pane"
            value={editingContent}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={t('editor.content_placeholder')}
          />
        </div>
      )}
    </>
  );
}
