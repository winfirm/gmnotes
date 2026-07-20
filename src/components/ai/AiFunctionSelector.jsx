// AI 功能选择器
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';

export function AiFunctionSelector() {
  const { t } = useI18n();
  const { aiFunction, setAiFunction } = useAi();

  const fns = ['optimize', 'create', 'translate', 'expand', 'compress', 'summary'];
  return (
    <div className="ai-section">
      <div className="ai-section-title">{t('ai.section.function')}</div>
      <div className="ai-function-grid">
        {fns.map(fn => (
          <button
            key={fn}
            className={'ai-function-btn' + (aiFunction === fn ? ' active' : '')}
            onClick={() => setAiFunction(fn)}
          >
            {t('ai.function.' + fn)}
          </button>
        ))}
      </div>
    </div>
  );
}
