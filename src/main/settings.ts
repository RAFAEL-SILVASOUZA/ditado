import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Settings } from '../shared/types'

export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'

export const DEFAULT_SETTINGS: Settings = {
  shortcut: DEFAULT_SHORTCUT,
  modelId: null,
  language: null,
  autoPaste: true,
  openAtLogin: false,
  welcomeSeen: false,
  overlayPosition: null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Só o que tem o tipo certo passa; o resto fica com o valor padrão (arquivo antigo ou editado à mão). */
export function sanitize(raw: unknown): Settings {
  const value = isRecord(raw) ? raw : {}
  const position = isRecord(value.overlayPosition) ? value.overlayPosition : null
  return {
    shortcut:
      typeof value.shortcut === 'string' && value.shortcut.trim() ? value.shortcut : DEFAULT_SHORTCUT,
    modelId: typeof value.modelId === 'string' ? value.modelId : null,
    language:
      typeof value.language === 'string' && /^[a-z]{2,3}$/.test(value.language) ? value.language : null,
    autoPaste: typeof value.autoPaste === 'boolean' ? value.autoPaste : DEFAULT_SETTINGS.autoPaste,
    openAtLogin: typeof value.openAtLogin === 'boolean' ? value.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
    welcomeSeen: typeof value.welcomeSeen === 'boolean' ? value.welcomeSeen : DEFAULT_SETTINGS.welcomeSeen,
    overlayPosition:
      position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.round(position.x as number), y: Math.round(position.y as number) }
        : null
  }
}

/** Configurações num JSON (gravado por arquivo temporário + rename, para não corromper se o app cair). */
export function createSettingsStore(file: string) {
  let current: Settings | null = null

  function read(): Settings {
    if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
    try {
      return sanitize(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  return {
    get(): Settings {
      return (current ??= read())
    },

    set(patch: Partial<Settings>): Settings {
      const next = sanitize({ ...this.get(), ...patch })
      mkdirSync(dirname(file), { recursive: true })
      const temp = `${file}.tmp`
      writeFileSync(temp, JSON.stringify(next, null, 2))
      renameSync(temp, file)
      current = next
      return next
    }
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>
