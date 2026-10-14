// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { LOGIN_ITEM_NAME, createLoginItem, type LoginItemApi } from '../../src/main/system/login-item'

function fakeApp(state: ReturnType<LoginItemApi['getLoginItemSettings']>) {
  return { getLoginItemSettings: vi.fn(() => state), setLoginItemSettings: vi.fn() }
}

describe('login item', () => {
  it('on Windows reads the Run entry the installer writes, by name', () => {
    const app = fakeApp({ openAtLogin: false, launchItems: [{ name: LOGIN_ITEM_NAME, enabled: true }] })
    expect(createLoginItem(app, 'win32').isEnabled()).toBe(true)

    const other = fakeApp({ openAtLogin: true, launchItems: [{ name: 'Outro', enabled: true }] })
    expect(createLoginItem(other, 'win32').isEnabled()).toBe(false)

    const disabled = fakeApp({ openAtLogin: false, launchItems: [{ name: LOGIN_ITEM_NAME, enabled: false }] })
    expect(createLoginItem(disabled, 'win32').isEnabled()).toBe(false)
  })

  it('on Windows writes with the same name the installer uses', () => {
    const app = fakeApp({ openAtLogin: false })
    createLoginItem(app, 'win32').setEnabled(false)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false, name: 'Ditado' })
  })

  it('on macOS follows what the system reports', () => {
    const app = fakeApp({ openAtLogin: true })
    const item = createLoginItem(app, 'darwin')
    expect(item.isEnabled()).toBe(true)
    item.setEnabled(true)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })
})
