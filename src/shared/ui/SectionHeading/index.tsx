import React from 'react';
import s from './SectionHeading.module.css';

interface Props {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function SectionHeading({ children, right, className = '' }: Props) {
  return (
    <div className={`${s.heading} ${className}`}>
      {children}
      {right && <span className={s.right}>{right}</span>}
      <span className={s.line} />
    </div>
  );
}
