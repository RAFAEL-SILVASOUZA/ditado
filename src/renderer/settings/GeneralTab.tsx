import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'

const LANGUAGES: { code: string; name: string }[] = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'Inglês' },
  { code: 'es', name: 'Espanhol' },
  { code: 'fr', name: 'Francês' },
  { code: 'de', name: 'Alemão' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: 'Japonês' },
  { code: 'zh', name: 'Chinês' }
]

/** Aba "Geral": idioma da fala, colagem automática e abrir junto com o sistema. */
export default function GeneralTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [systemLanguage, setSystemLanguage] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((r) => r.ok && setSettings(r.data))
    void window.api.settings.systemLanguage().then((r) => r.ok && setSystemLanguage(r.data))
  }, [])

  const update = async (patch: Partial<Settings>): Promise<void> => {
    setError(null)
    const result = await window.api.settings.set(patch)
    if (result.ok) setSettings(result.data)
    else setError(result.error.message)
  }

  if (!settings) return <p className="text-sm text-muted">Carregando...</p>

  const systemName = LANGUAGES.find((l) => l.code === systemLanguage)?.name ?? systemLanguage

  return (
    <div className="flex flex-col gap-6" data-testid="general-tab">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Idioma da fala</span>
        <select
          data-testid="language"
          value={settings.language ?? ''}
          onChange={(e) => void update({ language: e.target.value || null })}
          className="w-64 rounded-md border border-border bg-panel px-2 py-1.5 text-sm text-text"
        >
          <option value="">Automático (sistema: {systemName || '—'})</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">O Whisper transcreve melhor quando sabe em que idioma você fala.</span>
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          data-testid="auto-paste"
          className="mt-1"
          checked={settings.autoPaste}
          onChange={(e) => void update({ autoPaste: e.target.checked })}
        />
        <span className="flex flex-col">
          <span className="text-sm text-text">Colar automaticamente no app em foco</span>
          <span className="text-xs text-muted">
            O texto sempre vai para a área de transferência; com esta opção ele também é colado onde o cursor está.
            {window.api.platform === 'darwin' && ' No Mac, isso pede a permissão de Acessibilidade na primeira vez.'}
          </span>
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          data-testid="open-at-login"
          checked={settings.openAtLogin}
          onChange={(e) => void update({ openAtLogin: e.target.checked })}
        />
        <span className="text-sm text-text">Abrir o Ditado junto com o sistema</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
