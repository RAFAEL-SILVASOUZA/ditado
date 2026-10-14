import { systemPreferences } from 'electron'
import type { MicrophoneAccess } from '../../shared/types'

/**
 * A permissão de microfone no macOS. Na primeira vez abre o pedido do sistema; depois só informa. Nos outros
 * sistemas o Chromium cuida disso.
 */
export async function microphoneAccess(): Promise<MicrophoneAccess> {
  if (process.platform !== 'darwin') return 'granted'
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return 'granted'
  if (status === 'restricted') return 'restricted'
  if (status === 'denied') return 'denied'
  return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
}

/** macOS: o app pode teclar ⌘V em outro app. `prompt` abre o pedido do sistema (uma vez por execução). */
let prompted = false
export function canControlKeyboard(): boolean {
  if (process.platform !== 'darwin') return true
  const trusted = systemPreferences.isTrustedAccessibilityClient(!prompted)
  prompted = true
  return trusted
}
