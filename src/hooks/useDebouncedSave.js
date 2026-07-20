// 防抖保存 hook，自动在 unmount 时取消
import { useRef, useEffect, useCallback } from 'react';
import { SAVE_DEBOUNCE_MS } from '../constants';

export function useDebouncedSave(saveFn, delay) {
  const delayMs = delay || SAVE_DEBOUNCE_MS;
  const timerRef = useRef(null);
  const saveFnRef = useRef(saveFn);

  useEffect(() => {
    saveFnRef.current = saveFn;
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      saveFnRef.current();
    }, delayMs);
  }, [delayMs]);

  const cancelSave = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const flushSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      saveFnRef.current();
    }
  }, []);

  return { scheduleSave, cancelSave, flushSave };
}
