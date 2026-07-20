// 单条笔记项
import { useI18n } from '../contexts/I18nContext.jsx';
import { formatDate } from '../lib/formatDate';

export function NoteItem({ note, active, onSelect, onDelete }) {
  const { t, locale } = useI18n();

  return (
    <div
      className={'note-item' + (active ? ' active' : '')}
      onClick={() => onSelect(note)}
    >
      <div className="note-info">
        <div className="note-title">{note.title || t('sidebar.untitled')}</div>
        <div className="note-meta">
          <span>{formatDate(note.updatedAt, locale)}</span>
        </div>
      </div>
      <button
        className="note-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(note); }}
        title={t('sidebar.delete.tooltip')}
        aria-label={t('sidebar.delete.tooltip')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
