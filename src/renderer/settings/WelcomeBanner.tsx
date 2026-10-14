import { useEffect, useState } from 'react'

/**
 * macOS, primeira vez: o .dmg não tem instalador com opções, então a pergunta "iniciar junto com o Mac" aparece
 * aqui, no topo das configurações, até ser respondida. `onAnswered` avisa para as abas relerem a configuração.
 */
export default function WelcomeBanner({ onAnswered }: { onAnswered: () => void }) {
  const [visible, setVisible] = useState(false)
  const [openAtLogin, setOpenAtLogin] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (window.api.platform !== 'darwin') return
    void window.api.settings.get().then((r) => r.ok && !r.data.welcomeSeen && setVisible(true))
  }, [])

  if (!visible) return null

  const confirm = async (): Promise<void> => {
    setError(null)
    const result = await window.api.settings.set({ openAtLogin, welcomeSeen: true })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setVisible(false)
    onAnswered()
  }

  return (
    <div data-testid="welcome-banner" className="flex flex-col gap-3 border-b border-border bg-panel px-5 py-4">
      <p className="text-sm text-text">
        Boas-vindas ao Ditado! Ele fica na barra de menu, no alto da tela.
      </p>
      <div className="flex items-center gap-4">
        <label className="flex flex-1 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            data-testid="welcome-open-at-login"
            checked={openAtLogin}
            onChange={(e) => setOpenAtLogin(e.target.checked)}
          />
          Iniciar o Ditado junto com o Mac
        </label>
        <button
          type="button"
          data-testid="welcome-ok"
          onClick={() => void confirm()}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          OK
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
