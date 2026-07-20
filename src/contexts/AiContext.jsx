// AiContext：AI 助手状态机
import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { buildSystemPrompt, buildUserPrompt } from '../lib/aiPrompts';
import { DEFAULT_AI_ENDPOINT, AI_STORAGE_KEY } from '../constants';

const AiContext = createContext(null);

export function AiProvider({ children }) {
  const { showToast } = useToast();
  const { t, locale } = useI18n();

  // AI Config
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiConfig, setAiConfig] = useState({
    endpoint: DEFAULT_AI_ENDPOINT,
    model: '',
    tested: false,
    testSuccess: false
  });

  // Drawer
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiFunction, setAiFunctionState] = useState('optimize');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiWordCount, setAiWordCount] = useState(0);
  const [showInsertModeModal, setShowInsertModeModal] = useState(false);

  const abortRef = useRef(null);

  const aiReady = useMemo(() => !!aiConfig.endpoint, [aiConfig.endpoint]);

  // 加载本地配置
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_STORAGE_KEY);
      if (saved) {
        const c = JSON.parse(saved);
        setAiConfig(prev => ({
          ...prev,
          endpoint: c.endpoint || DEFAULT_AI_ENDPOINT,
          model: c.model || ''
        }));
      }
    } catch (e) {}
  }, []);

  const setAiField = useCallback((field, value) => {
    setAiConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const saveAiConfig = useCallback(() => {
    const c = {
      endpoint: aiConfig.endpoint.trim() || DEFAULT_AI_ENDPOINT,
      model: aiConfig.model.trim()
    };
    try { localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
    setAiConfig(prev => ({ ...prev, tested: false, testSuccess: false }));
    setShowAiConfig(false);
    showToast(t('toast.ai_config_saved'), 'success');
  }, [aiConfig, showToast, t]);

  const testAiConnection = useCallback(async () => {
    const endpoint = aiConfig.endpoint.trim() || DEFAULT_AI_ENDPOINT;
    try {
      const modelsUrl = endpoint.replace('/chat/completions', '/models');
      const res = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      setAiConfig(prev => ({ ...prev, tested: true, testSuccess: res.ok }));
      if (res.ok) {
        showToast(t('toast.ai_connected'), 'success');
      } else {
        showToast(t('toast.ai_connect_failed_http') + res.status, 'error');
      }
    } catch (e) {
      setAiConfig(prev => ({ ...prev, tested: true, testSuccess: false }));
      showToast(t('toast.ai_connect_failed') + (e.message || ''), 'error');
      console.error('[testAiConnection]', e);
    }
  }, [aiConfig.endpoint, showToast, t]);

  const openAiConfig = useCallback(() => {
    setShowAiConfig(true);
  }, []);

  const openAiDrawer = useCallback(() => {
    if (!aiConfig.endpoint) {
      setShowAiConfig(true);
      showToast(t('toast.ai_config_required'), 'info');
      return;
    }
    setAiResult('');
    setAiPrompt('');
    setShowAiDrawer(true);
  }, [aiConfig.endpoint, showToast, t]);

  const setAiFunction = useCallback((fn) => {
    setAiFunctionState(fn);
    setAiResult('');
    // 切换功能时重置 prompt（translate 默认填"英文"）
    if (fn === 'translate') {
      setAiPrompt(t('ai.user.translate_default'));
    } else {
      setAiPrompt('');
    }
  }, [t]);

  const getAiPromptPlaceholder = useCallback(() => {
    switch (aiFunction) {
      case 'optimize':  return t('ai.placeholder.optimize');
      case 'create':     return t('ai.placeholder.create');
      case 'translate':  return t('ai.placeholder.translate');
      case 'expand':     return t('ai.placeholder.expand');
      case 'compress':   return t('ai.placeholder.compress');
      case 'summary':    return t('ai.placeholder.summary');
      default:           return t('ai.placeholder.default');
    }
  }, [aiFunction, t]);

  const generateAiContent = useCallback(async (content, title) => {
    if (!aiConfig.endpoint) {
      showToast(t('toast.ai_config_required'), 'error');
      return;
    }
    if (aiGenerating) return;

    // create 功能要求 prompt 或 title
    if (aiFunction === 'create' && !aiPrompt.trim() && !title.trim()) {
      showToast(t('toast.ai_prompt_required'), 'error');
      return;
    }

    // 其他功能要求 content
    const needsContent = ['optimize', 'translate', 'expand', 'compress', 'summary'];
    if (needsContent.includes(aiFunction) && !content.trim()) {
      showToast(t('toast.ai_content_required'), 'error');
      return;
    }

    setAiGenerating(true);
    setAiResult('');

    const systemPrompt = buildSystemPrompt(aiFunction, locale, aiWordCount);
    const userPrompt = buildUserPrompt(aiFunction, locale, content, aiPrompt, title);

    const body = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      stream: false
    };
    if (aiConfig.model) body.model = aiConfig.model;

    abortRef.current = new AbortController();
    try {
      const res = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const c = data.choices?.[0]?.message?.content || '';
      if (c) {
        setAiResult(c.trim());
      } else {
        showToast(t('toast.ai_no_result'), 'error');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        showToast(t('toast.ai_request_failed') + (e.message || ''), 'error');
        console.error('[generateAiContent]', e);
      }
    } finally {
      setAiGenerating(false);
      abortRef.current = null;
    }
  }, [aiConfig, aiGenerating, aiFunction, aiPrompt, aiWordCount, locale, showToast, t]);

  const insertAiResult = useCallback(() => {
    if (!aiResult) return;
    setShowInsertModeModal(true);
  }, [aiResult]);

  const value = useMemo(() => ({
    showAiConfig, setShowAiConfig,
    aiConfig, setAiField,
    saveAiConfig, testAiConnection, openAiConfig,
    showAiDrawer, setShowAiDrawer,
    aiFunction, setAiFunction,
    aiPrompt, setAiPrompt,
    aiResult, setAiResult,
    aiGenerating,
    aiWordCount, setAiWordCount,
    aiReady,
    openAiDrawer,
    generateAiContent,
    insertAiResult,
    showInsertModeModal, setShowInsertModeModal,
    getAiPromptPlaceholder
  }), [showAiConfig, aiConfig, saveAiConfig, testAiConnection, openAiConfig,
      showAiDrawer, aiFunction, setAiFunction, aiPrompt, aiResult, aiGenerating,
      aiWordCount, aiReady, openAiDrawer, generateAiContent, insertAiResult,
      showInsertModeModal, getAiPromptPlaceholder]);

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAi must be used within AiProvider');
  return ctx;
}
