import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, message: string) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => remove(id), kind === 'error' ? 7000 : 4000);
  }, [remove]);
  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };
  const styles: Record<Kind, string> = {
    success: 'border-emerald-500 text-emerald-800',
    error: 'border-brand-red text-brand-red',
    info: 'border-brand-gold text-brand-navy',
  };
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:bottom-6 z-[100] flex flex-col gap-2 sm:w-96" role="status" aria-live="polite">
        {toasts.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className={`animate-fade-in flex items-start gap-3 rounded-xl border-l-4 bg-white px-4 py-3 shadow-lg ${styles[t.kind]}`}>
              <I className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm text-neutral-800">{t.message}</p>
              <button onClick={() => remove(t.id)} aria-label="Dismiss" className="text-neutral-400 hover:text-neutral-700"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
