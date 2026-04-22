import { useEffect, useRef } from 'react';
import s from './SettingsPanel.module.css';
import { useApp } from '../../app/store';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import type { AppSettings } from '../../shared/types';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { state, dispatch } = useApp();
  const { settings } = state;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function update(s: Partial<AppSettings>) {
    dispatch({ type: 'SET_SETTINGS', settings: s });
  }

  return (
    <div className={s.panel} ref={ref}>
      <h3 className={s.title}>빠른 설정</h3>
      <div className={s.body}>
        <div className={s.row}>
          <label>테마</label>
          <SegmentedControl
            size="sm"
            options={[{ value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }]}
            value={settings.theme}
            onChange={v => update({ theme: v })}
          />
        </div>
        <div className={s.row}>
          <label>강조색</label>
          <SegmentedControl
            size="sm"
            options={[
              { value: '245', label: '블루' },
              { value: '285', label: '보라' },
              { value: '165', label: '청록' },
              { value: '25',  label: '주황' },
            ]}
            value={String(settings.accentHue)}
            onChange={v => update({ accentHue: Number(v) })}
          />
        </div>
        <div className={s.row}>
          <label>바이트 표시</label>
          <SegmentedControl
            size="sm"
            options={[
              { value: 'hex',   label: 'HEX' },
              { value: 'ascii', label: 'ASCII' },
              { value: 'dec',   label: 'DEC' },
              { value: 'bin',   label: 'BIN' },
            ]}
            value={settings.byteFormat}
            onChange={v => update({ byteFormat: v as any })}
          />
        </div>
        <div className={s.row}>
          <label>밀도</label>
          <SegmentedControl
            size="sm"
            options={[
              { value: 'cozy',  label: '넓게' },
              { value: 'mid',   label: '보통' },
              { value: 'tight', label: '촘촘' },
            ]}
            value={settings.density}
            onChange={v => update({ density: v as any })}
          />
        </div>
        <div className={s.row}>
          <label>간격 행 표시</label>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={settings.showGapRows}
              onChange={e => update({ showGapRows: e.target.checked })}
            />
            <span>통신 간격 표시</span>
          </label>
        </div>
        <div className={s.row}>
          <label>자동 스크롤</label>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={settings.autoScroll}
              onChange={e => update({ autoScroll: e.target.checked })}
            />
            <span>새 패킷에 따라가기</span>
          </label>
        </div>
      </div>
    </div>
  );
}
