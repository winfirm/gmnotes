// i18n 聚合 + 检测 + 翻译
import { zh } from './zh';
import { en } from './en';
import { LANG_STORAGE_KEY } from '../constants';

export const messages = { zh, en };

export function detectLocale() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  if (urlLang === 'zh' || urlLang === 'en') return urlLang;
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

export function t(key, locale) {
  return (messages[locale] && messages[locale][key]) || messages.en[key] || key;
}
