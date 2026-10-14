import { ipcMain } from 'electron'
import type { IpcResult } from '../shared/types'
import { AppError } from './errors'

type Handler = (...args: never[]) => unknown

function toError(err: unknown): IpcResult<never> {
  if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } }
  const message = err instanceof Error ? err.message : String(err)
  console.error('[ipc]', err)
  return { ok: false, error: { code: 'IO', message } }
}

/** Registra um ipcMain.handle que embrulha o resultado (ou o erro) num IpcResult. */
export function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (err) {
      return toError(err)
    }
  })
}
