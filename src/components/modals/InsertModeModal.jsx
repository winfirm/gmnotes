// 插入方式选择弹窗
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';
import { useNotes } from '../../contexts/NotesContext.jsx';
import { ModalShell } from './ModalShell.jsx';

export function InsertModeModal() {
  const { t } = useI18n();
  const { showInsertModeModal, setShowInsertModeModal, aiResult } = useAi();
  const { insertContent } = useNotes();

  const handleInsert = (mode) => {
    setShowInsertModeModal(false);
    insertContent(aiResult, mode);
    window.dispatchEvent(new CustomEvent('gmnotes:close-ai-drawer'));
  };

  return (
    <ModalShell
      show={showInsertModeModal}
      onClose={() => setShowInsertModeModal(false)}
      zIndex={210}
      ariaLabel={t('insert.title')}
    >
      <h2>{t('insert.title')}</h2>
      <div className="insert-mode-options">
        <div className="insert-mode-option" onClick={() => handleInsert('replace')}>
          <div className="option-icon">🔄</div>
          <div className="option-text">
            <div className="option-title">{t('insert.replace.title')}</div>
            <div className="option-desc">{t('insert.replace.desc')}</div>
          </div>
        </div>
        <div className="insert-mode-option" onClick={() => handleInsert('cursor')}>
          <div className="option-icon">📍</div>
          <div className="option-text">
            <div className="option-title">{t('insert.cursor.title')}</div>
            <div className="option-desc">{t('insert.cursor.desc')}</div>
          </div>
        </div>
        <div className="insert-mode-option" onClick={() => handleInsert('replaceAll')}>
          <div className="option-icon">📄</div>
          <div className="option-text">
            <div className="option-title">{t('insert.replaceAll.title')}</div>
            <div className="option-desc">{t('insert.replaceAll.desc')}</div>
          </div>
        </div>
        <div className="insert-mode-option" onClick={() => handleInsert('append')}>
          <div className="option-icon">⬇️</div>
          <div className="option-text">
            <div className="option-title">{t('insert.append.title')}</div>
            <div className="option-desc">{t('insert.append.desc')}</div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button onClick={() => setShowInsertModeModal(false)}>{t('insert.cancel')}</button>
      </div>
    </ModalShell>
  );
}
