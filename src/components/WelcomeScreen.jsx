// 欢迎页
import { useI18n } from '../contexts/I18nContext.jsx';

export function WelcomeScreen({ onToggleSidebar }) {
  const { t } = useI18n();

  return (
    <div className="welcome">
      <button
        className="menu-btn welcome-menu-btn"
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
      <div className="welcome-icon">✍️</div>
      <div className="welcome-title">{t('app.title')}</div>
      <div className="welcome-sub">{t('app.welcome')}</div>
    </div>
  );
}
