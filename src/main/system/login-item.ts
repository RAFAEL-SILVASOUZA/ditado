/** Nome da entrada em HKCU\...\Run; o instalador (build/installer.nsh) grava com este mesmo nome. */
export const LOGIN_ITEM_NAME = 'Ditado'

/** O pedaço do `app` do Electron que mexe com o início junto com o sistema. */
export interface LoginItemApi {
  getLoginItemSettings(): {
    openAtLogin: boolean
    launchItems?: { name: string; enabled: boolean }[]
  }
  setLoginItemSettings(settings: { openAtLogin: boolean; name?: string }): void
}

/**
 * Abrir junto com o sistema. No Windows a entrada pode ter sido criada pelo instalador, então o estado é lido
 * pela entrada com o nosso nome; no macOS vale o que o sistema informa.
 */
export function createLoginItem(app: LoginItemApi, platform: NodeJS.Platform = process.platform) {
  return {
    isEnabled(): boolean {
      const settings = app.getLoginItemSettings()
      if (platform === 'win32' && settings.launchItems) {
        return settings.launchItems.some((item) => item.name === LOGIN_ITEM_NAME && item.enabled)
      }
      return settings.openAtLogin
    },

    setEnabled(openAtLogin: boolean): void {
      app.setLoginItemSettings(platform === 'win32' ? { openAtLogin, name: LOGIN_ITEM_NAME } : { openAtLogin })
    }
  }
}
