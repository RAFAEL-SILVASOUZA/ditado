import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'
import WelcomeBanner from '../../src/renderer/settings/WelcomeBanner'

function installApi(platform: string, welcomeSeen: boolean) {
  const api = {
    platform,
    settings: {
      get: vi.fn(async () => ({ ok: true, data: { welcomeSeen } as Settings })),
      set: vi.fn(async (patch: Partial<Settings>) => ({ ok: true, data: { welcomeSeen, ...patch } as Settings }))
    }
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

describe('WelcomeBanner', () => {
  it('asks on the first run on macOS and saves the answer', async () => {
    const api = installApi('darwin', false)
    const onAnswered = vi.fn()
    render(<WelcomeBanner onAnswered={onAnswered} />)
    await screen.findByTestId('welcome-banner')
    expect(screen.getByTestId('welcome-open-at-login')).toBeChecked()

    fireEvent.click(screen.getByTestId('welcome-open-at-login'))
    fireEvent.click(screen.getByTestId('welcome-ok'))
    await waitFor(() => expect(onAnswered).toHaveBeenCalled())
    expect(api.settings.set).toHaveBeenCalledWith({ openAtLogin: false, welcomeSeen: true })
    expect(screen.queryByTestId('welcome-banner')).not.toBeInTheDocument()
  })

  it('stays hidden once answered and on Windows', async () => {
    const mac = installApi('darwin', true)
    const { unmount } = render(<WelcomeBanner onAnswered={vi.fn()} />)
    await waitFor(() => expect(mac.settings.get).toHaveBeenCalled())
    expect(screen.queryByTestId('welcome-banner')).not.toBeInTheDocument()
    unmount()

    const win = installApi('win32', false)
    render(<WelcomeBanner onAnswered={vi.fn()} />)
    expect(win.settings.get).not.toHaveBeenCalled()
    expect(screen.queryByTestId('welcome-banner')).not.toBeInTheDocument()
  })
})
