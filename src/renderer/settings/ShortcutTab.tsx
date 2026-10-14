import { useCallback, useEffect, useState } from 'react'
import { acceleratorFromEvent, formatAccelerator } from '@shared/accelerator'

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'

const button =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-hover disabled:opacity-50'

/** Aba "Atalho": mostra e troca a combinação que abre a janelinha e confirma o ditado. */
export default function ShortcutTab() {
  const [shortcut, setShortcut] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const platform = window.api.platform

  useEffect(() => {
    void window.api.settings.get().then((r) => r.ok && setShortcut(r.data.shortcut))
  }, [])

  const save = useCallback(async (accelerator: string) => {
    setError(null)
    const result = await window.api.settings.setShortcut(accelerator)
    if (result.ok) setShortcut(result.data.shortcut)
    else setError(result.error.message)
  }, [])

  const stopCapture = useCallback(() => {
    setCapturing(false)
    void window.api.settings.suspendShortcut(false)
  }, [])

  useEffect(() => {
    if (!capturing) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        stopCapture()
        return
      }
      const accelerator = acceleratorFromEvent(event, platform)
      if (!accelerator) return
      setCapturing(false)
      // o main registra o novo atalho e volta a ouvir; se falhar, restaura o anterior
      void save(accelerator).finally(() => void window.api.settings.suspendShortcut(false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [capturing, platform, save, stopCapture])

  const startCapture = (): void => {
    setError(null)
    setCapturing(true)
    // senão o atalho atual dispara o ditado em vez de ser capturado
    void window.api.settings.suspendShortcut(true)
  }

  return (
    <div className="flex flex-col gap-5" data-testid="shortcut-tab">
      <p className="text-sm text-muted">
        Aperte o atalho em qualquer app para abrir a janelinha e começar a falar. Aperte de novo (ou clique em ✓)
        para transcrever e colar o texto onde o cursor está. <kbd className="rounded bg-hover px-1">Esc</kbd>{' '}
        cancela.
      </p>

      <div className="flex items-center gap-3">
        <div
          data-testid="shortcut-value"
          className={`min-w-48 rounded-md border px-4 py-2 text-center font-mono text-base ${
            capturing ? 'border-accent text-accent' : 'border-border text-text'
          }`}
        >
          {capturing ? 'Pressione a combinação…' : shortcut ? formatAccelerator(shortcut, platform) : '—'}
        </div>
        {capturing ? (
          <button type="button" className={button} onClick={stopCapture}>
            Cancelar
          </button>
        ) : (
          <button type="button" className={button} data-testid="shortcut-change" onClick={startCapture}>
            Alterar
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={capturing || shortcut === DEFAULT_SHORTCUT}
          onClick={() => void save(DEFAULT_SHORTCUT)}
        >
          Restaurar padrão
        </button>
      </div>

      <p className="text-xs text-muted">
        Use pelo menos uma tecla modificadora (Ctrl, Alt, {platform === 'darwin' ? '⌘, ' : ''}Shift) com uma letra,
        número ou Espaço — ou uma tecla de função (F1–F24) sozinha.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
