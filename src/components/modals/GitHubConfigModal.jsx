// GitHub 配置弹窗
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useGitHubConfig } from '../../contexts/GitHubConfigContext.jsx';
import { ModalShell } from './ModalShell.jsx';

export function GitHubConfigModal() {
  const { t } = useI18n();
  const {
    showConfig, setShowConfig,
    configForm, setConfigField,
    saveConfig, clearConfig
  } = useGitHubConfig();

  return (
    <ModalShell
      show={showConfig}
      onClose={() => setShowConfig(false)}
      ariaLabel={t('config.github.title')}
    >
      <h2>{t('config.github.title')}</h2>
      <div className="form-group">
        <label>{t('config.github.token')}</label>
        <input
          type="password"
          value={configForm.token}
          onChange={(e) => setConfigField('token', e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
        />
        <div className="form-hint">{t('config.github.token_hint')}</div>
      </div>
      <div className="form-group">
        <label>{t('config.github.owner')}</label>
        <input
          type="text"
          value={configForm.owner}
          onChange={(e) => setConfigField('owner', e.target.value)}
          placeholder="e.g. octocat"
        />
      </div>
      <div className="form-group">
        <label>{t('config.github.repo')}</label>
        <input
          type="text"
          value={configForm.repo}
          onChange={(e) => setConfigField('repo', e.target.value)}
          placeholder="e.g. my-notes"
        />
      </div>
      <div className="form-group">
        <label>{t('config.github.path')}</label>
        <input
          type="text"
          value={configForm.path}
          onChange={(e) => setConfigField('path', e.target.value)}
          placeholder={t('config.github.path_placeholder')}
        />
        <div className="form-hint">{t('config.github.path_hint')}</div>
      </div>
      <div className="modal-footer">
        <button onClick={clearConfig}>{t('config.github.clear')}</button>
        <button className="btn-primary" onClick={saveConfig}>{t('config.github.save')}</button>
      </div>
    </ModalShell>
  );
}
