import React, { useEffect, useRef, useState } from 'react';
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

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  allowFloat?: boolean;
  allowNegative?: boolean;
  className?: string;
}

export function NumericInput({ value, onChange, allowFloat, allowNegative, className = '', ...rest }: NumericInputProps) {
  const [str, setStr] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setStr(String(value));
  }, [value]);

  const pattern = allowNegative
    ? (allowFloat ? /^-?\d*\.?\d*$/ : /^-?\d*$/)
    : (allowFloat ? /^\d*\.?\d*$/ : /^\d*$/);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (!pattern.test(raw)) return;
    const norm = raw.replace(/^(-?)0+(\d)/, '$1$2');
    setStr(norm);
    const num = norm === '' || norm === '-' || norm === '.' ? 0 : parseFloat(norm);
    if (!isNaN(num)) onChange(num);
  }

  function handleBlur() {
    focused.current = false;
    // Normalize display: remove trailing dot, set empty → 0
    const num = parseFloat(str);
    const normalized = isNaN(num) ? 0 : num;
    setStr(String(normalized));
    onChange(normalized);
  }

  return (
    <input
      {...rest}
      className={className}
      type="text"
      inputMode={allowFloat ? 'decimal' : allowNegative ? 'text' : 'numeric'}
      value={str}
      onFocus={e => { focused.current = true; e.target.select(); }}
      onBlur={handleBlur}
      onChange={handleChange}
    />
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
