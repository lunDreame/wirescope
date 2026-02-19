import type { AppSettings } from '../types/wirescope'

const SETTINGS_KEY = 'wirescope_settings_v2'

export const defaultSettings: AppSettings = {
  mode: 'serial',
  viewMode: 'ascii',
  serial: {
    baud: 115200,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    flow: 'none',
    append: 'lf',
  },
  socket: {
    host: '127.0.0.1',
    port: 12345,
    proto: 'tcp',
    append: 'lf',
  },
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      return defaultSettings
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>

    return {
      ...defaultSettings,
      ...parsed,
      serial: {
        ...defaultSettings.serial,
        ...(parsed.serial ?? {}),
      },
      socket: {
        ...defaultSettings.socket,
        ...(parsed.socket ?? {}),
      },
    }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore localStorage write failures in restricted environments.
  }
}
