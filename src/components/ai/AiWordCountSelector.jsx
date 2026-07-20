// AI 字数选择器
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';

export function AiWordCountSelector() {
  const { t } = useI18n();
  const { aiWordCount, setAiWordCount } = useAi();

  const counts = [100, 300, 500, 0];
  return (
    <div className="ai-section" style={{ padding: '12px 16px' }}>
      <div className="ai-wordcount-section">
        <span className="ai-wordcount-label">{t('ai.word_limit')}</span>
        <div className="ai-wordcount-grid">
          {counts.map(wc => (
            <button
              key={wc}
              className={'ai-wordcount-btn' + (aiWordCount === wc ? ' active' : '')}
              onClick={() => setAiWordCount(wc)}
            >
              {wc === 0 ? t('ai.no_limit') : wc}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
