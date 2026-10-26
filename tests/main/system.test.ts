// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ globalShortcut: {} }))

const { DEFAULT_SETTINGS, createSettingsStore, sanitize } = await import('../../src/main/settings')
const { createShortcuts } = await import('../../src/main/shortcuts')
const { deliverText, pasteCommand } = await import('../../src/main/system/paste')

describe('settings', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ditado-settings-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts with the defaults and persists changes', () => {
    const file = join(dir, 'settings.json')
    const store = createSettingsStore(file)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    store.set({ modelId: 'whisper-small-q8', language: 'pt' })
    expect(createSettingsStore(file).get()).toMatchObject({ modelId: 'whisper-small-q8', language: 'pt' })
    expect(JSON.parse(readFileSync(file, 'utf8')).modelId).toBe('whisper-small-q8')
  })

  it('falls back to the defaults on a corrupt file and on wrong types', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{oops')
    expect(createSettingsStore(file).get()).toEqual(DEFAULT_SETTINGS)
    expect(sanitize({ shortcut: '', language: 'portuguese', autoPaste: 'yes', overlayPosition: { x: 'a' } })).toEqual(
      DEFAULT_SETTINGS
    )
  })
})

describe('shortcuts', () => {
  function fakeDeps(taken: string[] = []) {
    const registered = new Map<string, () => void>()
    return {
      registered,
      deps: {
        register: vi.fn((accelerator: string, callback: () => void) => {
          if (taken.includes(accelerator)) return false
          registered.set(accelerator, callback)
          return true
        }),
        unregister: vi.fn((accelerator: string) => void registered.delete(accelerator))
      }
    }
  }

  it('swaps the shortcut and keeps the previous one when the new is taken', () => {
    const { registered, deps } = fakeDeps(['Control+Space'])
    const onToggle = vi.fn()
    const shortcuts = createShortcuts({ onToggle, onCancel: vi.fn() }, deps)
    shortcuts.set('Alt+D')
    expect(() => shortcuts.set('Control+Space')).toThrow('Control+Space')
    expect([...registered.keys()]).toEqual(['Alt+D'])
    expect(shortcuts.current).toBe('Alt+D')
    registered.get('Alt+D')!()
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('releases the shortcut while suspended', () => {
    const { registered, deps } = fakeDeps()
    const shortcuts = createShortcuts({ onToggle: vi.fn(), onCancel: vi.fn() }, deps)
    shortcuts.set('Alt+D')
    shortcuts.suspend(true)
    expect(registered.size).toBe(0)
    shortcuts.suspend(false)
    expect([...registered.keys()]).toEqual(['Alt+D'])
  })

  it('registers Escape only while asked', () => {
    const { registered, deps } = fakeDeps()
    const onCancel = vi.fn()
    const shortcuts = createShortcuts({ onToggle: vi.fn(), onCancel }, deps)
    shortcuts.setEscape(true)
    registered.get('Escape')!()
    expect(onCancel).toHaveBeenCalledOnce()
    shortcuts.setEscape(false)
    expect(registered.has('Escape')).toBe(false)
  })
})

describe('paste', () => {
  it('builds the keystroke command of each system', () => {
    expect(pasteCommand('win32')?.file).toBe('powershell.exe')
    expect(pasteCommand('win32')?.args.at(-1)).toContain("SendWait('^v')")
    expect(pasteCommand('win32')?.args).not.toContain('Bypass')
    expect(pasteCommand('darwin')).toEqual({
      file: 'osascript',
      args: ['-e', 'tell application "System Events" to keystroke "v" using command down']
    })
    expect(pasteCommand('linux')).toBeNull()
  })

  it('copies and pastes', async () => {
    const writeClipboard = vi.fn()
    const run = vi.fn(async () => undefined)
    await expect(deliverText('olá', true, { writeClipboard, run, platform: 'win32' })).resolves.toEqual({
      pasted: true
    })
    expect(writeClipboard).toHaveBeenCalledWith('olá')
    expect(run).toHaveBeenCalledOnce()
  })

  it('only copies when auto paste is off', async () => {
    const run = vi.fn(async () => undefined)
    await expect(deliverText('olá', false, { writeClipboard: vi.fn(), run, platform: 'win32' })).resolves.toEqual({
      pasted: false
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps the text copied and warns when macOS denies Accessibility or the keystroke fails', async () => {
    const writeClipboard = vi.fn()
    const run = vi.fn(async () => undefined)
    const mac = await deliverText('olá', true, { writeClipboard, run, platform: 'darwin', canControlKeyboard: () => false })
    expect(mac).toMatchObject({ pasted: false })
    expect(mac.warning).toContain('Acessibilidade')
    expect(run).not.toHaveBeenCalled()

    const failing = await deliverText('olá', true, {
      writeClipboard,
      run: async () => {
        throw new Error('boom')
      },
      platform: 'win32'
    })
    expect(failing).toMatchObject({ pasted: false })
    expect(writeClipboard).toHaveBeenCalledTimes(2)
  })
})
