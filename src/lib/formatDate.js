// 相对时间格式化
import { t } from '../i18n';

export function formatDate(iso, locale) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return t('format.just_now', locale);
  if (diff < 3600000) return Math.floor(diff / 60000) + t('format.minutes_ago', locale);
  if (diff < 86400000) return Math.floor(diff / 3600000) + t('format.hours_ago', locale);
  if (diff < 604800000) return Math.floor(diff / 86400000) + t('format.days_ago', locale);
  return d.toLocaleDateString(t('format.locale', locale), {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}
