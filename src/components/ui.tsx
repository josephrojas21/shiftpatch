'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Check, LoaderCircle, Plus, X } from 'lucide-react';
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Plus size={23} strokeWidth={3} />
      </span>
      ShiftPatch<span className="brand-dot">.</span>
    </div>
  );
}
export function Spinner({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={23} />
      <span>{label}</span>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Check size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>We couldn’t load this view</strong>
        <p>{error.message}</p>
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ')}
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Submit({
  busy,
  children,
  testId,
}: {
  busy: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy} data-testid={testId}>
      {busy ? (
        <>
          <LoaderCircle size={17} className="spin" />
          Working…
        </>
      ) : (
        children
      )}
    </button>
  );
}
