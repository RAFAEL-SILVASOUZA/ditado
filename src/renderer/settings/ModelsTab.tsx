import { useCallback, useEffect, useState } from 'react'
import { CloudDownload, Trash2, X } from 'lucide-react'
import type { ModelTier, SpeechModelInfo } from '@shared/types'

export const formatSize = (bytes: number): string =>
  bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`

const TIERS: { id: ModelTier; title: string; hint: string }[] = [
  { id: 'cpu', title: 'CPU', hint: 'Roda em qualquer computador.' },
  {
    id: 'gpu-small',
    title: 'GPU pequena',
    hint: '2–4 GB de memória de vídeo: placas de entrada, notebooks, GPUs integradas e Macs M1/M2.'
  },
  { id: 'gpu-large', title: 'GPU grande', hint: '6 GB ou mais de memória de vídeo, ou Macs com 16 GB+ de memória.' }
]

const iconButton =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-50'

/** Aba "Modelos": baixa, remove e escolhe o modelo Whisper que transcreve a fala. */
export default function ModelsTab() {
  const [models, setModels] = useState<SpeechModelInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    const result = await window.api.models.list()
    if (result.ok) setModels(result.data)
    else setError(result.error.message)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const settings = await window.api.settings.get()
      if (!active) return
      if (settings.ok) setSelected(settings.data.modelId)
      await loadModels()
      if (active) setLoading(false)
    })()
    const stop = window.api.models.onEvent((event) => {
      if (event.status === 'progress') {
        setModels((list) =>
          list.map((m) =>
            m.id === event.id
              ? { ...m, downloading: { receivedBytes: event.receivedBytes, totalBytes: event.totalBytes } }
              : m
          )
        )
        return
      }
      if (event.status === 'error') setError(event.error ?? 'Falha no download.')
      void (async () => {
        await loadModels()
        // o primeiro modelo baixado já fica escolhido: o ditado funciona sem mais um clique
        if (event.status !== 'done') return
        const settings = await window.api.settings.get()
        if (settings.ok && !settings.data.modelId) {
          const saved = await window.api.settings.set({ modelId: event.id })
          if (saved.ok && active) setSelected(saved.data.modelId)
        }
      })()
    })
    return () => {
      active = false
      stop()
    }
  }, [loadModels])

  const choose = async (modelId: string): Promise<void> => {
    setError(null)
    const previous = selected
    setSelected(modelId)
    const result = await window.api.settings.set({ modelId })
    if (!result.ok) {
      setSelected(previous)
      setError(result.error.message)
    }
  }

  const act = async (run: () => Promise<{ ok: boolean; error?: { message: string } }>): Promise<void> => {
    setError(null)
    const result = await run()
    if (!result.ok) setError(result.error?.message ?? 'Falha na operação.')
    await loadModels()
  }

  const remove = async (model: SpeechModelInfo): Promise<void> => {
    await act(() => window.api.models.remove(model.id))
    // remover o modelo escolhido deixa o ditado sem modelo (o main limpa a escolha)
    const settings = await window.api.settings.get()
    if (settings.ok) setSelected(settings.data.modelId)
  }

  if (loading) return <p className="text-sm text-muted">Carregando...</p>

  return (
    <div className="flex flex-col gap-6" data-testid="models-tab">
      <p className="text-sm text-muted">
        O modelo transcreve a sua fala no seu computador: o áudio não sai da máquina. Os modelos de GPU usam
        DirectML no Windows e CoreML no Mac; se a GPU não der conta, o Ditado volta para a CPU sozinho. Na dúvida,
        comece pelo <strong className="text-text">Large v3 Turbo da GPU pequena</strong>.
      </p>

      {TIERS.map((tier) => (
        <section key={tier.id} className="flex flex-col gap-2" data-testid={`tier-${tier.id}`}>
          <div>
            <h2 className="text-sm font-semibold text-text">{tier.title}</h2>
            <p className="text-xs text-muted">{tier.hint}</p>
          </div>
          {models
            .filter((model) => model.tier === tier.id)
            .map((model) => {
              const progress = model.downloading
              const percent =
                progress && progress.totalBytes > 0
                  ? Math.floor((progress.receivedBytes / progress.totalBytes) * 100)
                  : 0
              return (
                <div
                  key={model.id}
                  data-testid={`model-${model.id}`}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <input
                    type="radio"
                    name="speech-model"
                    aria-label={`Usar ${model.name} (${tier.title})`}
                    data-testid={`use-${model.id}`}
                    checked={selected === model.id}
                    disabled={!model.installed}
                    onChange={() => void choose(model.id)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-text">
                      {model.name} <span className="text-xs text-muted">· {formatSize(model.sizeBytes)}</span>
                    </span>
                    <span className="text-xs text-muted">{model.description}</span>
                    {progress && (
                      <div
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        data-testid={`progress-${model.id}`}
                        className="mt-1 h-1.5 w-full overflow-hidden rounded bg-hover"
                      >
                        <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>
                  {progress ? (
                    <button
                      type="button"
                      aria-label={`Cancelar download de ${model.name}`}
                      data-testid={`cancel-${model.id}`}
                      onClick={() => void act(() => window.api.models.cancel(model.id))}
                      className={iconButton}
                    >
                      <X size={16} />
                    </button>
                  ) : model.installed ? (
                    <button
                      type="button"
                      aria-label={`Remover ${model.name}`}
                      data-testid={`remove-${model.id}`}
                      onClick={() => void remove(model)}
                      className={iconButton}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Baixar ${model.name}`}
                      title="Baixar"
                      data-testid={`download-${model.id}`}
                      onClick={() => void act(() => window.api.models.download(model.id))}
                      className={iconButton}
                    >
                      <CloudDownload size={18} />
                    </button>
                  )}
                </div>
              )
            })}
        </section>
      ))}

      {error && (
        <p role="alert" data-testid="models-error" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
