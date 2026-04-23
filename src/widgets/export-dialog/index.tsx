import { useState } from 'react';
import s from './ExportDialog.module.css';
import { Dialog } from '../../shared/ui/Dialog';
import { useT } from '../../shared/lib/i18n';
import type { Packet } from '../../shared/types';

type ExportFormat = 'json' | 'csv' | 'hex' | 'log';

interface Props {
  open:     boolean;
  onClose:  () => void;
  packets:  Packet[];
  onExport: (content: string, ext: string) => void;
}

function formatJson(packets: Packet[]): string {
  return JSON.stringify(packets, null, 2);
}

function formatCsv(packets: Packet[]): string {
  const header = 'id,timestamp_ms,direction,session_id,gap_ms,length,hex';
  const rows = packets.map(p =>
    [
      p.id,
      p.timestamp_ms,
      p.direction,
      p.session_id,
      p.gap_ms != null ? p.gap_ms.toFixed(3) : '',
      p.bytes.length,
      p.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

function formatHex(packets: Packet[]): string {
  return packets
    .map(p => `${p.direction}  ${p.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`)
    .join('\n');
}

function formatLog(packets: Packet[]): string {
  return packets.map(p => {
    const d = new Date(p.timestamp_ms);
    const ts = [
      d.getHours().toString().padStart(2, '0'),
      d.getMinutes().toString().padStart(2, '0'),
      d.getSeconds().toString().padStart(2, '0'),
    ].join(':') + '.' + d.getMilliseconds().toString().padStart(3, '0');
    const gap = p.gap_ms != null ? `+${p.gap_ms.toFixed(1)}ms`.padEnd(10) : '          ';
    const hex = p.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    return `[${ts}] ${p.direction.padEnd(2)}  ${p.bytes.length.toString().padStart(5)}B  ${gap}  ${hex}`;
  }).join('\n');
}

const FORMATS: { id: ExportFormat; ext: string }[] = [
  { id: 'json', ext: 'json' },
  { id: 'csv',  ext: 'csv'  },
  { id: 'hex',  ext: 'txt'  },
  { id: 'log',  ext: 'log'  },
];

function buildContent(packets: Packet[], fmt: ExportFormat): string {
  switch (fmt) {
    case 'json': return formatJson(packets);
    case 'csv':  return formatCsv(packets);
    case 'hex':  return formatHex(packets);
    case 'log':  return formatLog(packets);
  }
}

export function ExportDialog({ open, onClose, packets, onExport }: Props) {
  const t = useT();
  const [selected, setSelected] = useState<ExportFormat>('json');

  function handleExport() {
    const fmt = FORMATS.find(f => f.id === selected)!;
    onExport(buildContent(packets, selected), fmt.ext);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('export.title')}
      subtitle={`${packets.length}${t('export.packets')}`}
      width={480}
      footer={
        <div className={s.footer}>
          <button className={s.cancel} onClick={onClose}>{t('export.cancel')}</button>
          <button className={s.confirm} onClick={handleExport} disabled={packets.length === 0}>
            {t('toolbar.export')} · {selected.toUpperCase()}
          </button>
        </div>
      }
    >
      <div className={s.grid}>
        {FORMATS.map(({ id }) => (
          <button
            key={id}
            className={`${s.card} ${selected === id ? s.active : ''}`}
            onClick={() => setSelected(id)}
          >
            <span className={s.label}>{t(`export.${id}`)}</span>
            <span className={s.desc}>{t(`export.${id}.desc`)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
