import React from 'react';
import s from './Input.module.css';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  mono?: boolean;
  label?: string;
  hint?: string;
  error?: string;
  suffix?: React.ReactNode;
  prefix?: React.ReactNode;
}

export function Input({ mono, label, hint, error, suffix, prefix, className = '', ...rest }: InputProps) {
  const input = (
    <div className={`${s.wrap} ${error ? s.hasError : ''}`}>
      {prefix && <span className={s.affix}>{prefix}</span>}
      <input className={`${s.inp} ${mono ? s.mono : ''} ${className}`} {...rest} />
      {suffix && <span className={s.affix}>{suffix}</span>}
    </div>
  );
  if (!label && !hint && !error) return input;
  return (
    <label className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      {input}
      {hint && !error && <span className={s.hint}>{hint}</span>}
      {error && <span className={s.error}>{error}</span>}
    </label>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  mono?: boolean;
  label?: string;
  hint?: string;
  children: React.ReactNode;
}

export function Select({ mono, label, hint, className = '', children, ...rest }: SelectProps) {
  const sel = (
    <select className={`${s.sel} ${mono ? s.mono : ''} ${className}`} {...rest}>
      {children}
    </select>
  );
  if (!label && !hint) return sel;
  return (
    <label className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      {sel}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  label?: string;
  hint?: string;
}

export function TextArea({ mono, label, hint, className = '', ...rest }: TextAreaProps) {
  const ta = <textarea className={`${s.inp} ${s.ta} ${mono ? s.mono : ''} ${className}`} {...rest} />;
  if (!label) return ta;
  return (
    <label className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      {ta}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  );
}
