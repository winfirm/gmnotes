// 浮动语言切换按钮
import { useI18n } from '../contexts/I18nContext.jsx';

export function LanguageToggle() {
  const { locale, toggleLocale } = useI18n();
  const title = locale === 'zh' ? 'Switch to English' : '切换到中文';
  return (
    <button
      className="btn-lang-float"
      onClick={toggleLocale}
      title={title}
      aria-label={title}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}
