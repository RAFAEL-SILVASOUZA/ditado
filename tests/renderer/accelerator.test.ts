import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent, formatAccelerator, type KeyLike } from '@shared/accelerator'

const key = (code: string, mods: Partial<KeyLike> = {}, keyValue = 'x'): KeyLike => ({
  key: keyValue,
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods
})

describe('acceleratorFromEvent', () => {
  it('builds the accelerator from the key position, not the layout', () => {
    expect(acceleratorFromEvent(key('Space', { ctrlKey: true, shiftKey: true }), 'win32')).toBe('Control+Shift+Space')
    expect(acceleratorFromEvent(key('KeyD', { altKey: true }, 'ð'), 'win32')).toBe('Alt+D')
    expect(acceleratorFromEvent(key('Digit5', { metaKey: true }), 'darwin')).toBe('Command+5')
    expect(acceleratorFromEvent(key('Digit5', { metaKey: true }), 'win32')).toBe('Super+5')
  })

  it('accepts a lone function key and rejects plain keys, Shift+letter and bare modifiers', () => {
    expect(acceleratorFromEvent(key('F9'), 'win32')).toBe('F9')
    expect(acceleratorFromEvent(key('KeyA'), 'win32')).toBeNull()
    expect(acceleratorFromEvent(key('KeyA', { shiftKey: true }), 'win32')).toBeNull()
    expect(acceleratorFromEvent(key('ControlLeft', { ctrlKey: true }, 'Control'), 'win32')).toBeNull()
    expect(acceleratorFromEvent(key('IntlRo', { ctrlKey: true }), 'win32')).toBeNull()
  })
})

describe('formatAccelerator', () => {
  it('reads like each system writes shortcuts', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'win32')).toBe('Ctrl+Shift+Espaço')
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘⇧Espaço')
  })
})
