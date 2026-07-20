// ToastContext：3 种类型 + 自动消失（error 延长至 4s）
import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { TOAST_DURATION_MS, TOAST_ERROR_DURATION_MS } from '../constants';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const timerRef = useRef(null);

  const dismissToast = useCallback(() => {
    setToast(t => ({ ...t, show: false }));
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type });
    if (timerRef.current) clearTimeout(timerRef.current);
    const duration = type === 'error' ? TOAST_ERROR_DURATION_MS : TOAST_DURATION_MS;
    timerRef.current = setTimeout(() => {
      setToast(t => ({ ...t, show: false }));
      timerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const value = useMemo(() => ({ toast, showToast, dismissToast }),
    [toast, showToast, dismissToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
