import s from './HexDump.module.css';
import type { ByteFormat } from '../../types';

interface HighlightRange {
  start: number;
  end:   number;
  kind:  'sync' | 'chk' | 'bad' | 'end' | 'highlight';
}

interface Props {
  bytes:      number[];
  highlights?: HighlightRange[];
  rowSize?:   number;
  format?:    ByteFormat;
}

function formatByte(b: number, fmt: ByteFormat): string {
  switch (fmt) {
    case 'ascii': return (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
    case 'dec':   return b.toString().padStart(3, ' ');
    case 'bin':   return b.toString(2).padStart(8, '0');
    default:      return b.toString(16).padStart(2, '0').toUpperCase();
  }
}

function cellWidth(fmt: ByteFormat): number {
  switch (fmt) {
    case 'ascii': return 1;
    case 'dec':   return 4;  // "255 "
    case 'bin':   return 9;  // "11111111 "
    default:      return 3;  // "FF "
  }
}

export function HexDump({ bytes, highlights = [], rowSize = 16, format = 'hex' }: Props) {
  function getKind(byteIndex: number): string | undefined {
    for (const h of highlights) {
      if (byteIndex >= h.start && byteIndex < h.end) return h.kind;
    }
    return undefined;
  }

  const rows: Array<{ offset: number; chunk: number[] }> = [];
  for (let i = 0; i < bytes.length; i += rowSize) {
    rows.push({ offset: i, chunk: bytes.slice(i, i + rowSize) });
  }

  const padCols = rowSize - 1;
  const padStr = ' '.repeat(cellWidth(format) * padCols);

  return (
    <div className={s.dump}>
      {rows.map(row => (
        <div key={row.offset} className={s.row}>
          <span className={s.off}>{row.offset.toString(16).padStart(4, '0')}  </span>
          <span className={s.hex}>
            {row.chunk.map((b, i) => {
              const idx = row.offset + i;
              const kind = getKind(idx);
              const cell = formatByte(b, format);
              const sep = i < row.chunk.length - 1 ? ' ' : '';
              return (
                <span key={i} className={kind ? s[kind] : ''}>
                  {cell}{sep}
                </span>
              );
            })}
            {/* Pad short last row to align */}
            {row.chunk.length < rowSize && (
              <span>{padStr.slice(0, cellWidth(format) * (rowSize - row.chunk.length))}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
