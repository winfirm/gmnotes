// Toast
import { useToast } from '../contexts/ToastContext';

export function Toast() {
  const { toast } = useToast();
  if (!toast.show) return null;
  return <div className={'toast ' + toast.type} role="status" aria-live="polite">{toast.message}</div>;
}
