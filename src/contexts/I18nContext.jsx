// I18nContext：响应式 locale + t()
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { detectLocale, t as translate } from '../i18n';
import { LANG_STORAGE_KEY } from '../constants';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => detectLocale());

  const setLocale = useCallback((lang) => {
    setLocaleState(lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState(prev => {
      const next = prev === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch (e) {}
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
      return next;
    });
  }, []);

  const t = useCallback((key) => translate(key, locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const value = useMemo(() => ({ locale, t, setLocale, toggleLocale }),
    [locale, t, setLocale, toggleLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
