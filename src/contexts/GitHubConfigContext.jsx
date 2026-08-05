// GitHubConfigContext：配置增删改查，githubConfigRef 供 fetch 频繁读取
import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { STORAGE_KEY, DIR_STORAGE_KEY } from '../constants';
import { parsePath } from '../lib/githubApi';

const GitHubConfigContext = createContext(null);

export function GitHubConfigProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useI18n();

  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ token: '', owner: '', repo: '', path: '' });
  const [githubReady, setGithubReady] = useState(false);
  // 配置版本号：配置变更时自增，供依赖它的副作用感知变更（ref 变更不触发渲染）
  const [configVersion, setConfigVersion] = useState(0);
  // githubConfig 频繁被读取但不需触发渲染，用 ref
  const githubConfigRef = useRef({ token: '', owner: '', repo: '', path: '' });
  
  // 当前选中的目录
  const [currentDir, setCurrentDir] = useState(() => {
    try {
      return localStorage.getItem(DIR_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  });

  const loadConfig = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const c = JSON.parse(saved);
        githubConfigRef.current = {
          token: c.token || '',
          owner: c.owner || '',
          repo: c.repo || '',
          path: c.path || ''
        };
        setConfigForm({ ...githubConfigRef.current });
        setGithubReady(!!(c.token && c.owner && c.repo));
        setConfigVersion(v => v + 1);
        
        // 初始化 currentDir：如果当前目录不在路径列表中，重置为第一个目录
        const dirs = parsePath(c.path);
        const savedDir = localStorage.getItem(DIR_STORAGE_KEY);
        // '' 始终有效（default 标签），或 savedDir 在子目录列表中
        if (savedDir === '' || dirs.includes(savedDir)) {
          setCurrentDir(savedDir);
        } else if (dirs.length > 0) {
          setCurrentDir(dirs[0]);
          try { localStorage.setItem(DIR_STORAGE_KEY, dirs[0]); } catch (e) {}
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const setConfigField = useCallback((field, value) => {
    setConfigForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const saveConfig = useCallback(() => {
    const c = {
      token: configForm.token.trim(),
      owner: configForm.owner.trim(),
      repo: configForm.repo.trim(),
      path: configForm.path.trim().replace(/\/+$/, '')
    };
    if (!c.token || !c.owner || !c.repo) {
      showToast(t('toast.config_required'), 'error');
      return;
    }
    githubConfigRef.current = c;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
    setGithubReady(true);
    setConfigVersion(v => v + 1);
    setShowConfig(false);
    showToast(t('toast.config_saved'), 'success');
    // 触发同步由调用方或事件处理
    window.dispatchEvent(new CustomEvent('gmnotes:config-saved'));
  }, [configForm, showToast, t]);

  const clearConfig = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    githubConfigRef.current = { token: '', owner: '', repo: '', path: '' };
    setConfigForm({ token: '', owner: '', repo: '', path: '' });
    setGithubReady(false);
    setConfigVersion(v => v + 1);
    setShowConfig(false);
    showToast(t('toast.config_cleared'), 'info');
    window.dispatchEvent(new CustomEvent('gmnotes:config-cleared'));
  }, [showToast, t]);

  const value = useMemo(() => ({
    showConfig, setShowConfig,
    configForm, setConfigField,
    githubReady,
    configVersion,
    githubConfigRef,
    saveConfig, clearConfig,
    currentDir, setCurrentDir
  }), [showConfig, configForm, githubReady, configVersion, setConfigField, saveConfig, clearConfig, currentDir, setCurrentDir]);

  return <GitHubConfigContext.Provider value={value}>{children}</GitHubConfigContext.Provider>;
}

export function useGitHubConfig() {
  const ctx = useContext(GitHubConfigContext);
  if (!ctx) throw new Error('useGitHubConfig must be used within GitHubConfigProvider');
  return ctx;
}
