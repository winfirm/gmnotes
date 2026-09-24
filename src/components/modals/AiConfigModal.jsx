// AI 配置弹窗
import { useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useAi } from '../../contexts/AiContext.jsx';
import { ModalShell } from './ModalShell.jsx';

export function AiConfigModal() {
  const { t } = useI18n();
  const {
    showAiConfig, setShowAiConfig,
    aiConfig, setAiField,
    saveAiConfig, testAiConnection
  } = useAi();
  const [showApiKey, setShowApiKey] = useState(false);

  const statusClass = aiConfig.tested
    ? (aiConfig.testSuccess ? 'connected' : 'disconnected')
    : 'disconnected';
  const statusText = aiConfig.tested
    ? (aiConfig.testSuccess ? t('config.ai.connected') : t('config.ai.failed'))
    : t('config.ai.not_tested');

  return (
    <ModalShell
      show={showAiConfig}
      onClose={() => setShowAiConfig(false)}
      zIndex={210}
      ariaLabel={t('config.ai.title')}
    >
      <h2>{t('config.ai.title')}</h2>
      <div className={'ai-config-status ' + statusClass}>
        <span className="status-dot"></span>
        <span>{statusText}</span>
      </div>
      <div className="form-group">
        <label>{t('config.ai.endpoint')}</label>
        <input
          type="text"
          value={aiConfig.endpoint}
          onChange={(e) => setAiField('endpoint', e.target.value)}
          placeholder="http://localhost:1234/v1/chat/completions"
        />
        <div className="form-hint">{t('config.ai.endpoint_hint')}</div>
      </div>
      <div className="form-group">
        <label>{t('config.ai.model')}</label>
        <input
          type="text"
          value={aiConfig.model}
          onChange={(e) => setAiField('model', e.target.value)}
          placeholder={t('config.ai.model_placeholder')}
        />
      </div>
      <div className="form-group">
        <label>{t('config.ai.apiKey')}</label>
        <div className="ai-config-key-row">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={aiConfig.apiKey}
            onChange={(e) => setAiField('apiKey', e.target.value)}
            placeholder={t('config.ai.apiKey_placeholder')}
            autoComplete="off"
          />
          <button
            type="button"
            className="ai-config-key-toggle"
            onClick={() => setShowApiKey(v => !v)}
            aria-label={showApiKey ? t('config.ai.hide_key') : t('config.ai.show_key')}
          >
            {showApiKey ? t('config.ai.hide_key') : t('config.ai.show_key')}
          </button>
        </div>
        <div className="form-hint">{t('config.ai.apiKey_hint')}</div>
      </div>
      <div className="modal-footer">
        <button onClick={testAiConnection}>{t('config.ai.test')}</button>
        <button onClick={() => setShowAiConfig(false)}>{t('config.ai.cancel')}</button>
        <button className="btn-primary" onClick={saveAiConfig}>{t('config.ai.save')}</button>
      </div>
    </ModalShell>
  );
}
