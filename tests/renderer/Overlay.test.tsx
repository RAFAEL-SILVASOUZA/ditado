import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverlayCommand, Settings } from '@shared/types'

const recorder = {
  levels: [0, 0.5, 1],
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => new Float32Array(16_000)),
  cancel: vi.fn(async () => undefined)
}
vi.mock('../../src/renderer/overlay/use-recorder', () => ({ useRecorder: () => recorder }))

const { default: Overlay } = await import('../../src/renderer/overlay/Overlay')

let command: (c: OverlayCommand) => void = () => undefined
const settings = (modelId: string | null) =>
  ({ ok: true, data: { modelId } as Settings }) as const

function installApi(overrides: { modelId?: string | null; text?: string; usedFallback?: boolean } = {}) {
  const api = {
    platform: 'win32',
    settings: { get: vi.fn(async () => settings(overrides.modelId === undefined ? 'm' : overrides.modelId)) },
    speech: {
      transcribe: vi.fn(async () => ({
        ok: true,
        data: { text: overrides.text ?? 'olá mundo', usedFallback: overrides.usedFallback ?? false }
      }))
    },
    overlay: {
      onCommand: (cb: (c: OverlayCommand) => void) => {
        command = cb
        return () => undefined
      },
      deliver: vi.fn(async () => ({ ok: true, data: { pasted: true } })),
      dismiss: vi.fn(async () => ({ ok: true, data: null })),
      resize: vi.fn(async () => ({ ok: true, data: null })),
      reveal: vi.fn(async () => ({ ok: true, data: null }))
    },
    openSettings: vi.fn(async () => ({ ok: true, data: null }))
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

const phase = (): string | null => screen.getByTestId('overlay').getAttribute('data-phase')

describe('Overlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records on the first toggle and delivers the text on the second', async () => {
    const api = installApi()
    render(<Overlay />)
    act(() => command('toggle'))
    await waitFor(() => expect(phase()).toBe('recording'))
    expect(recorder.start).toHaveBeenCalledOnce()

    act(() => command('toggle'))
    await waitFor(() => expect(api.overlay.deliver).toHaveBeenCalledWith('olá mundo'))
    await waitFor(() => expect(phase()).toBe('idle'))
    expect(api.overlay.reveal).not.toHaveBeenCalled()
  })

  it('confirms with the ✓ button and cancels with Escape', async () => {
    const api = installApi()
    render(<Overlay />)
    act(() => command('toggle'))
    await waitFor(() => expect(phase()).toBe('recording'))
    fireEvent.click(screen.getByTestId('overlay-confirm'))
    await waitFor(() => expect(api.overlay.deliver).toHaveBeenCalled())

    act(() => command('toggle'))
    await waitFor(() => expect(phase()).toBe('recording'))
    act(() => command('cancel'))
    await waitFor(() => expect(api.overlay.dismiss).toHaveBeenCalled())
    expect(recorder.cancel).toHaveBeenCalled()
    expect(api.overlay.deliver).toHaveBeenCalledOnce()
  })

  it('asks for a model instead of recording when none is chosen', async () => {
    const api = installApi({ modelId: null })
    render(<Overlay />)
    act(() => command('toggle'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('modelo'))
    expect(recorder.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('overlay-settings'))
    expect(api.openSettings).toHaveBeenCalledWith('models')
  })

  it('shows the fallback notice again after delivering', async () => {
    const api = installApi({ usedFallback: true })
    render(<Overlay />)
    act(() => command('toggle'))
    await waitFor(() => expect(phase()).toBe('recording'))
    act(() => command('toggle'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('CPU'))
    expect(api.overlay.deliver).toHaveBeenCalled()
    expect(api.overlay.reveal).toHaveBeenCalled()
  })
})
