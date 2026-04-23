import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import s from './SettingsPanel.module.css';
import { useApp } from '../../app/store';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useT } from '../../shared/lib/i18n';
import { useUpdate, type UpdateInfo } from '../../shared/lib/update-context';
import type { AppSettings } from '../../shared/types';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'installing' }
  | { kind: 'error'; msg: string };

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { state, dispatch } = useApp();
  const { settings } = state;
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const { pendingUpdate, clearUpdate } = useUpdate();

  // If the context already has an update (auto-detected on startup), show it immediately
  const [upd, setUpd] = useState<UpdateState>(() =>
    pendingUpdate ? { kind: 'available', info: pendingUpdate } : { kind: 'idle' }
  );

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

  async function checkForUpdate() {
    setUpd({ kind: 'checking' });
    try {
      const info = await invoke<UpdateInfo | null>('check_update');
      if (info) {
        setUpd({ kind: 'available', info });
      } else {
        setUpd({ kind: 'upToDate' });
        setTimeout(() => setUpd({ kind: 'idle' }), 3000);
      }
    } catch (e) {
      setUpd({ kind: 'error', msg: String(e) });
      setTimeout(() => setUpd({ kind: 'idle' }), 4000);
    }
  }

  async function installUpdate() {
    setUpd({ kind: 'installing' });
    clearUpdate();
    try {
      await invoke('install_update');
      // app.restart() is called from Rust — this line won't be reached
    } catch (e) {
      setUpd({ kind: 'error', msg: String(e) });
      setTimeout(() => setUpd({ kind: 'idle' }), 4000);
    }
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

        {/* ── Update section ── */}
        <div className={s.divider} />
        <div className={s.updateRow}>
          {upd.kind === 'idle' && (
            <button className={s.updateBtn} onClick={checkForUpdate}>
              {t('update.check')}
            </button>
          )}
          {upd.kind === 'checking' && (
            <span className={s.updateStatus}>{t('update.checking')}</span>
          )}
          {upd.kind === 'upToDate' && (
            <span className={`${s.updateStatus} ${s.ok}`}>{t('update.upToDate')}</span>
          )}
          {upd.kind === 'available' && (
            <>
              <span className={`${s.updateStatus} ${s.avail}`}>
                {t('update.versionLabel')}<strong>{upd.info.version}</strong>
              </span>
              <button className={`${s.updateBtn} ${s.primary}`} onClick={installUpdate}>
                {t('update.install')}
              </button>
            </>
          )}
          {upd.kind === 'installing' && (
            <span className={s.updateStatus}>{t('update.installing')}</span>
          )}
          {upd.kind === 'error' && (
            <span className={`${s.updateStatus} ${s.err}`}>
              {t('update.error')}{upd.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
