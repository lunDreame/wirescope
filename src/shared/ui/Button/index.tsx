import React from 'react';
import s from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  kbd?: string;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  kbd,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button className={`${s.btn} ${s[variant]} ${s[size]} ${className}`} {...rest}>
      {icon && <span className={s.icon}>{icon}</span>}
      {children}
      {kbd && <kbd className={s.kbd}>{kbd}</kbd>}
    </button>
  );
}
