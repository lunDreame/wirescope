import React from 'react';
import s from './StatusBar.module.css';

interface Props {
  left?:   React.ReactNode;
  right?:  React.ReactNode;
  center?: React.ReactNode;
}

export function StatusBar({ left, right, center }: Props) {
  return (
    <div className={s.bar}>
      <div className={s.left}>{left}</div>
      {center && <div className={s.center}>{center}</div>}
      <div className={s.right}>{right}</div>
    </div>
  );
}

export function StatusChip({ dot, children }: { dot?: string; children: React.ReactNode }) {
  return (
    <span className={s.chip}>
      {dot && <span className={s.dot} style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function StatusSep() {
  return <span className={s.sep} />;
}
