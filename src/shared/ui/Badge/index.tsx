import React from 'react';
import s from './Badge.module.css';

type BadgeVariant = 'tx' | 'rx' | 'ok' | 'err' | 'warn' | 'neutral' | 'brand';

interface Props {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: Props) {
  return <span className={`${s.badge} ${s[variant]} ${className}`}>{children}</span>;
}

interface DotProps {
  variant?: BadgeVariant | 'connected' | 'disconnected' | 'error';
}

export function StatusDot({ variant = 'neutral' }: DotProps) {
  return <span className={`${s.dot} ${s['dot-' + variant]}`} />;
}
