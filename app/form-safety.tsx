'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type FormHTMLAttributes } from 'react';

type Entry = { form: HTMLFormElement; save: () => Promise<boolean> };
type Guard = (next: () => void, scope?: HTMLFormElement | null) => void;
const Safety = createContext<{ guard: Guard; dirty: Map<HTMLFormElement, Entry> } | null>(null);
export function useFormSafety() {
  const value = useContext(Safety);
  if (!value) throw new Error('FormSafety is required');
  return value;
}

export function FormSafety({ children }: { children: ReactNode }) {
  const dirty = useRef(new Map<HTMLFormElement, Entry>()).current;
  const [pending, setPending] = useState<{ next: () => void; entries: Entry[] }>();
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ([...dirty.keys()].some(form => form.isConnected)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);
  const guard: Guard = (next, scope) => {
    if (leaving.current) return;
    const entries = [...dirty.values()].filter(entry => entry.form.isConnected && (!scope || entry.form === scope));
    if (entries.length) setPending({ next, entries }); else next();
  };
  return <Safety.Provider value={{ guard, dirty }}>{children}
    <dialog ref={dialog} className="unsaved-dialog" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" onCancel={event => { event.preventDefault(); if (!saving) setPending(undefined); }}>
      <h2 id="unsaved-title">還有尚未儲存的修改</h2>
      <p id="unsaved-description">可先儲存再離開，或繼續填寫。放棄修改只會取消這次輸入。</p>
      <div className="dialog-actions">
        <button autoFocus disabled={saving} onClick={() => setPending(undefined)}>繼續編輯</button>
        <button disabled={saving} onClick={() => {
          const next = pending?.next;
          pending?.entries.forEach(({ form }) => { form.reset(); dirty.delete(form); });
          setPending(undefined); next?.();
        }}>放棄修改</button>
        <button className="primary" disabled={saving} onClick={async () => {
          if (!pending) return;
          setSaving(true); leaving.current = true;
          // Close the modal so native validation and the affected form can receive focus.
          dialog.current?.close();
          try {
            for (const entry of pending.entries) {
              if (entry.form.isConnected && !await entry.save()) { setPending(undefined); return; }
            }
            const next = pending.next; setPending(undefined); leaving.current = false; next();
          } finally { leaving.current = false; setSaving(false); }
        }}>{saving ? '儲存中…' : '儲存並離開'}</button>
      </div>
    </dialog>
  </Safety.Provider>;
}

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSave: (data: FormData) => Promise<boolean>;
  onSaved?: () => void;
};
export function TrackedForm({ onSave, onSaved, children, onChangeCapture, onReset, ...props }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const { dirty } = useFormSafety();
  const [feedback, setFeedback] = useState('');
  const latest = useRef({ onSave, onSaved }); latest.current = { onSave, onSaved };
  useEffect(() => { const element = form.current; return () => { if (element) dirty.delete(element); }; }, [dirty]);
  async function save() {
    const element = form.current;
    if (!element || inFlight.current) return false;
    if (!element.reportValidity()) { element.querySelector<HTMLElement>(':invalid')?.focus(); return false; }
    inFlight.current = true;
    const submittedRevision = revision.current;
    try {
      const ok = await latest.current.onSave(new FormData(element));
      if (ok && revision.current !== submittedRevision) { setFeedback('先前內容已儲存；新的修改仍需儲存。'); return false; }
      if (ok) { dirty.delete(element); setFeedback('已儲存'); latest.current.onSaved?.(); }
      else { setFeedback('尚未儲存，請查看錯誤提示後重試。'); element.scrollIntoView({ block: 'center' }); }
      return ok;
    } finally { inFlight.current = false; }
  }
  return <form {...props} ref={form} onChangeCapture={event => {
    revision.current += 1;
    if (form.current) dirty.set(form.current, { form: form.current, save });
    setFeedback('尚未儲存'); onChangeCapture?.(event);
  }} onReset={event => { if (form.current) dirty.delete(form.current); setFeedback(''); onReset?.(event); }} onSubmit={event => { event.preventDefault(); void save(); }}>
    {children}<p className="form-feedback" role="status">{feedback}</p>
  </form>;
}
