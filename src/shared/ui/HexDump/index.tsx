import s from './HexDump.module.css';
import type { ByteFormat } from '../../types';

interface HighlightRange {
  start: number;
  end:   number;
  kind:  'sync' | 'chk' | 'bad' | 'end' | 'highlight';
}

interface Props {
  bytes:       number[];
  highlights?: HighlightRange[];
  rowSize?:    number; // kept for API compat, no longer used — width is container-driven
  format?:     ByteFormat;
}

function formatByte(b: number, fmt: ByteFormat): string {
  switch (fmt) {
    case 'ascii': return (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
    case 'dec':   return b.toString().padStart(3, ' ');
    case 'bin':   return b.toString(2).padStart(8, '0');
    default:      return b.toString(16).padStart(2, '0').toUpperCase();
  }
}

export function HexDump({ bytes, highlights = [], format = 'hex' }: Props) {
  function getKind(idx: number): string | undefined {
    for (const h of highlights) {
      if (idx >= h.start && idx < h.end) return h.kind;
    }
  }

  return (
    <div className={s.dump}>
      {bytes.map((b, i) => {
        const kind = getKind(i);
        return (
          <span key={i} className={`${s.cell} ${kind ? s[kind] : ''}`}>
            {formatByte(b, format)}
          </span>
        );
      })}
    </div>
  );
}
