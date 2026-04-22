import { useEffect, useRef } from 'react';
import s from './SettingsPanel.module.css';
import { useApp } from '../../app/store';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useT } from '../../shared/lib/i18n';
import type { AppSettings } from '../../shared/types';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { state, dispatch } = useApp();
  const { settings } = state;
  const t = useT();
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
      <h3 className={s.title}>{t('settings.title')}</h3>
      <div className={s.body}>
        <div className={s.row}>
          <label>{t('settings.language')}</label>
          <SegmentedControl
            size="sm"
            options={[{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }]}
            value={settings.language ?? 'ko'}
            onChange={v => update({ language: v as 'ko' | 'en' })}
          />
        </div>
        <div className={s.row}>
          <label>{t('settings.theme')}</label>
          <SegmentedControl
            size="sm"
            options={[{ value: 'light', label: t('settings.light') }, { value: 'dark', label: t('settings.dark') }]}
            value={settings.theme}
            onChange={v => update({ theme: v })}
          />
        </div>
        <div className={s.row}>
          <label>{t('settings.accentColor')}</label>
          <SegmentedControl
            size="sm"
            options={[
              { value: '245', label: t('settings.blue') },
              { value: '285', label: t('settings.purple') },
              { value: '165', label: t('settings.teal') },
              { value: '25',  label: t('settings.orange') },
            ]}
            value={String(settings.accentHue)}
            onChange={v => update({ accentHue: Number(v) })}
          />
        </div>
        <div className={s.row}>
          <label>{t('settings.byteDisplay')}</label>
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
          <label>{t('settings.density')}</label>
          <SegmentedControl
            size="sm"
            options={[
              { value: 'cozy',  label: t('settings.cozy') },
              { value: 'mid',   label: t('settings.mid') },
              { value: 'tight', label: t('settings.tight') },
            ]}
            value={settings.density}
            onChange={v => update({ density: v as any })}
          />
        </div>
        <div className={s.row}>
          <label>{t('settings.showGapRows')}</label>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={settings.showGapRows}
              onChange={e => update({ showGapRows: e.target.checked })}
            />
            <span>{t('settings.showGapDesc')}</span>
          </label>
        </div>
        <div className={s.row}>
          <label>{t('settings.autoScroll')}</label>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={settings.autoScroll}
              onChange={e => update({ autoScroll: e.target.checked })}
            />
            <span>{t('settings.autoScrollDesc')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
