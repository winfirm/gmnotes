// AI prompt 构建纯函数（与原 gmnotes.html L2184-2245 行为逐字一致）
import { t } from '../i18n';

export function buildSystemPrompt(fn, locale, wordCount) {
  const wcHint = wordCount > 0
    ? t('ai.system.wc_hint', locale).replace('${wc}', wordCount)
    : '';
  switch (fn) {
    case 'optimize':  return t('ai.system.optimize', locale) + wcHint;
    case 'create':     return t('ai.system.create', locale) + wcHint;
    case 'translate':  return t('ai.system.translate', locale) + wcHint;
    case 'expand':     return t('ai.system.expand', locale) + wcHint;
    case 'compress':   return t('ai.system.compress', locale) + wcHint;
    case 'summary':    return t('ai.system.summary', locale) + wcHint;
    default:           return t('ai.system.default', locale) + wcHint;
  }
}

export function buildUserPrompt(fn, locale, content, extraPrompt, title) {
  let userMsg = '';
  switch (fn) {
    case 'optimize':
      userMsg = t('ai.user.optimize', locale) + content;
      if (extraPrompt) userMsg += t('ai.user.optimize_direction', locale) + extraPrompt;
      break;
    case 'create':
      if (extraPrompt && title.trim()) {
        userMsg = t('ai.user.create_title', locale) + title.trim() + t('ai.user.create_requirements', locale) + extraPrompt;
      } else if (extraPrompt) {
        userMsg = extraPrompt;
      } else if (title.trim()) {
        userMsg = t('ai.user.create_from_title', locale) + title.trim();
      } else {
        userMsg = t('ai.user.create_fallback', locale);
      }
      break;
    case 'translate':
      userMsg = t('ai.user.translate', locale) + (extraPrompt || t('ai.user.translate_default', locale)) + t('ai.user.translate_colon', locale) + content;
      break;
    case 'expand':
      userMsg = t('ai.user.expand', locale) + content;
      if (extraPrompt) userMsg += t('ai.user.expand_direction', locale) + extraPrompt;
      break;
    case 'compress':
      userMsg = t('ai.user.compress', locale) + content;
      if (extraPrompt) userMsg += t('ai.user.compress_direction', locale) + extraPrompt;
      break;
    case 'summary':
      userMsg = t('ai.user.summary', locale) + content;
      if (extraPrompt) userMsg += t('ai.user.summary_direction', locale) + extraPrompt;
      break;
    default:
      userMsg = content;
  }
  return userMsg;
}
