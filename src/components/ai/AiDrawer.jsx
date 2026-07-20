// AI 抽屉
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';
import { useNotes } from '../../contexts/NotesContext.jsx';
import { AiFunctionSelector } from './AiFunctionSelector.jsx';
import { AiWordCountSelector } from './AiWordCountSelector.jsx';
import { AiResultPanel } from './AiResultPanel.jsx';

export function AiDrawer() {
  const { t } = useI18n();
  const {
    showAiDrawer, setShowAiDrawer,
    aiFunction, aiPrompt, setAiPrompt,
    aiResult, aiGenerating, aiReady,
    openAiConfig, generateAiContent, insertAiResult,
    getAiPromptPlaceholder
  } = useAi();
  const { editingContent, editingTitle } = useNotes();

  if (!showAiDrawer) return null;

  const handleGenerate = () => generateAiContent(editingContent, editingTitle);

  const promptLabel = aiFunction === 'create'
    ? t('ai.prompt.create')
    : aiFunction === 'translate'
      ? t('ai.prompt.translate')
      : t('ai.prompt.default');

  return (
    <div className="ai-drawer-overlay" onClick={() => setShowAiDrawer(false)}>
      <div className="ai-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="ai-drawer-header">
          <h2>{t('ai.title')}</h2>
          <button className="close-btn" onClick={() => setShowAiDrawer(false)} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="ai-drawer-body">
          <AiFunctionSelector />
          <AiWordCountSelector />
          <div className="ai-prompt-area">
            <div className="ai-prompt-label">{promptLabel}</div>
            <textarea
              className="ai-prompt-input"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={getAiPromptPlaceholder()}
            />
          </div>
          <AiResultPanel />
        </div>
        <div className="ai-drawer-footer">
          <button onClick={openAiConfig}>{t('ai.footer.config')}</button>
          <button onClick={() => setShowAiDrawer(false)}>{t('ai.footer.cancel')}</button>
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={aiGenerating || !aiReady}
          >
            {aiGenerating ? t('ai.footer.generating') : t('ai.footer.generate')}
          </button>
          <button
            className="btn-primary"
            onClick={insertAiResult}
            disabled={!aiResult || aiGenerating}
          >
            {t('ai.footer.insert')}
          </button>
        </div>
      </div>
    </div>
  );
}
