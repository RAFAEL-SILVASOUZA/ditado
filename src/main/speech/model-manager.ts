import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { SpeechDownloadEvent, SpeechModelInfo } from '../../shared/types'
import { AppError } from '../errors'
import { SPEECH_CATALOG, fileUrl, modelSize, type SpeechCatalogModel } from './model-catalog'

export interface SpeechModelManagerDeps {
  /** Pasta onde cada modelo ganha a sua subpasta (`<dir>/<id>/`). */
  dir: string
  emit: (event: SpeechDownloadEvent) => void
  fetchImpl?: typeof fetch
  catalog?: readonly SpeechCatalogModel[]
}

interface ActiveDownload {
  controller: AbortController
  receivedBytes: number
  totalBytes: number
  lastEmit: number
}

/** Os modelos grandes chegam em dezenas de milhares de pedaços: o progresso vai para a tela no máximo assim. */
const PROGRESS_INTERVAL_MS = 150

/**
 * Catálogo, download (vários arquivos, com progresso somado e cancelamento) e remoção dos modelos de fala.
 * Os arquivos vão para `<id>.part/` e a pasta só ganha o nome final quando tudo chegou: `installed` nunca
 * enxerga um modelo pela metade.
 */
export function createSpeechModelManager({
  dir,
  emit,
  fetchImpl = fetch,
  catalog = SPEECH_CATALOG
}: SpeechModelManagerDeps) {
  const downloads = new Map<string, ActiveDownload>()

  function find(id: string): SpeechCatalogModel {
    const model = catalog.find((m) => m.id === id)
    if (!model) throw new AppError('NOT_FOUND', 'Modelo desconhecido.')
    return model
  }

  const folderOf = (model: SpeechCatalogModel): string => join(dir, model.id)

  async function run(model: SpeechCatalogModel, state: ActiveDownload): Promise<void> {
    const target = folderOf(model)
    const partial = `${target}.part`
    try {
      rmSync(partial, { recursive: true, force: true })
      for (const file of model.files) {
        const response = await fetchImpl(fileUrl(model, file), {
          signal: state.controller.signal,
          redirect: 'follow'
        })
        if (!response.ok || !response.body)
          throw new Error(`o servidor respondeu ${response.status} para ${file.path}`)
        const destination = join(partial, file.path)
        mkdirSync(dirname(destination), { recursive: true })
        const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
        source.on('data', (chunk: Buffer) => {
          state.receivedBytes += chunk.length
          const now = Date.now()
          if (now - state.lastEmit < PROGRESS_INTERVAL_MS) return
          state.lastEmit = now
          emit({
            id: model.id,
            status: 'progress',
            receivedBytes: state.receivedBytes,
            totalBytes: state.totalBytes
          })
        })
        await pipeline(source, createWriteStream(destination), { signal: state.controller.signal })
      }
      renameSync(partial, target)
      emit({
        id: model.id,
        status: 'done',
        receivedBytes: state.receivedBytes,
        totalBytes: state.totalBytes
      })
    } catch (err) {
      rmSync(partial, { recursive: true, force: true })
      const cancelled = state.controller.signal.aborted
      emit({
        id: model.id,
        status: cancelled ? 'cancelled' : 'error',
        receivedBytes: 0,
        totalBytes: state.totalBytes,
        ...(cancelled
          ? {}
          : { error: `Falha no download: ${err instanceof Error ? err.message : String(err)}` })
      })
    } finally {
      downloads.delete(model.id)
    }
  }

  return {
    list(): SpeechModelInfo[] {
      return catalog.map((model) => {
        const active = downloads.get(model.id)
        return {
          id: model.id,
          name: model.name,
          description: model.description,
          tier: model.tier,
          sizeBytes: modelSize(model),
          installed: existsSync(folderOf(model)),
          ...(active
            ? {
                downloading: { receivedBytes: active.receivedBytes, totalBytes: active.totalBytes }
              }
            : {})
        }
      })
    },

    isInstalled(id: string): boolean {
      return existsSync(folderOf(find(id)))
    },

    /** Começa o download e retorna logo; o resultado vem por `emit`. */
    download(id: string): void {
      const model = find(id)
      if (downloads.has(id)) return
      if (existsSync(folderOf(model)))
        throw new AppError('VALIDATION', 'Esse modelo já está instalado.')
      const state: ActiveDownload = {
        controller: new AbortController(),
        receivedBytes: 0,
        totalBytes: modelSize(model),
        lastEmit: 0
      }
      downloads.set(id, state)
      void run(model, state)
    },

    cancel(id: string): void {
      downloads.get(id)?.controller.abort()
    },

    remove(id: string): void {
      const model = find(id)
      if (downloads.has(id))
        throw new AppError('VALIDATION', 'Cancele o download antes de remover.')
      rmSync(folderOf(model), { recursive: true, force: true })
    }
  }
}

export type SpeechModelManager = ReturnType<typeof createSpeechModelManager>
