// AI 结果展示
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';

export function AiResultPanel() {
  const { t } = useI18n();
  const { aiResult, aiGenerating } = useAi();

  if (!aiResult && !aiGenerating) return null;

  const waiting = aiGenerating && !aiResult;

  return (
    <div className="ai-result-area">
      <div className="ai-result-label">
        <span>{t('ai.result.title')}</span>
        {aiGenerating && <span style={{ color: 'var(--accent)' }}>{t('ai.result.generating')}</span>}
      </div>
      <div className={'ai-result-content' + (waiting ? ' loading' : '')}>
        {waiting ? t('ai.result.waiting') : aiResult}
      </div>
    </div>
  );
}
