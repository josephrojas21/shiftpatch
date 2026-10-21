'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { UserDto } from '@/contracts';
import { testIds } from '@/contracts';
import { Analytics } from './analytics';
type Notice = { type: 'success' | 'error'; text: string };
const Context = createContext<{ user: UserDto; notify: (notice: Notice) => void } | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: true, retry: false } },
      }),
  );
  useEffect(() => {
    const expired = () => {
      void client.invalidateQueries({ queryKey: ['session'] });
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <Analytics />
      {children}
    </QueryClientProvider>
  );
}
export function WorkspaceProvider({ user, children }: { user: UserDto; children: ReactNode }) {
  const [notice, notify] = useState<Notice | null>(null);
  return (
    <Context.Provider value={{ user, notify }}>
      {children}
      {notice && (
        <div
          className={`toast ${notice.type}`}
          role={notice.type === 'error' ? 'alert' : 'status'}
          data-testid={testIds.notification}
        >
          {notice.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{notice.text}</span>
          <button aria-label="Dismiss notification" onClick={() => notify(null)}>
            <X size={17} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing workspace provider');
  return value;
}
export function useAction<T, V = void>(
  action: (variables: V) => Promise<T>,
  message: string,
  onSuccess?: (result: T) => void,
) {
  const client = useQueryClient();
  const { notify } = useWorkspace();
  return useMutation({
    mutationFn: action,
    onSuccess: (result) => {
      notify({ type: 'success', text: message });
      void client.invalidateQueries();
      onSuccess?.(result);
    },
    onError: (error: Error) => notify({ type: 'error', text: error.message }),
  });
}
