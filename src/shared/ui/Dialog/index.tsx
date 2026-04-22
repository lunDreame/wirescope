import React, { useEffect } from 'react';
import s from './Dialog.module.css';

interface Props {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
  footer?:  React.ReactNode;
  width?:   number;
}

export function Dialog({ open, onClose, title, subtitle, children, footer, width = 820 }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={s.dim} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.dialog} style={{ width }}>
        <div className={s.head}>
          <div>
            <h2 className={s.title}>{title}</h2>
            {subtitle && <div className={s.subtitle}>{subtitle}</div>}
          </div>
          <button className={s.close} onClick={onClose} title="닫기 (Esc)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </div>
    </div>
  );
}
