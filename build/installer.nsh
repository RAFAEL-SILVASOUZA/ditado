; Página "Opções" do instalador do Windows: atalho na área de trabalho e iniciar junto com o Windows.
; O electron-builder insere este arquivo no installer.nsi (ver `nsis.include` no electron-builder.yml).
; O atalho automático do electron-builder está desligado (createDesktopShortcut: false): quem cria é o customInstall.
; A entrada em Run usa o mesmo nome que o app usa em setLoginItemSettings (src/main/system/login-item.ts).

!include nsDialogs.nsh
!include LogicLib.nsh

!define DITADO_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define DITADO_RUN_VALUE "Ditado"

!ifndef BUILD_UNINSTALLER
  Var DitadoDesktopCheckbox
  Var DitadoStartupCheckbox
  Var DitadoCreateDesktop
  Var DitadoStartWithWindows
!endif

; as duas opções começam marcadas (também valem na instalação silenciosa, que pula as páginas)
!macro customInit
  StrCpy $DitadoCreateDesktop ${BST_CHECKED}
  StrCpy $DitadoStartWithWindows ${BST_CHECKED}
!macroend

; as funções ficam aqui dentro: este arquivo entra antes do MUI2.nsh, e este macro roda depois dele
!macro customPageAfterChangeDir
  Page custom DitadoOptionsPage DitadoOptionsLeave

  Function DitadoOptionsPage
    !insertmacro MUI_HEADER_TEXT "Opções" "Escolha como o Ditado deve ser instalado."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateCheckbox} 0 0 100% 12u "Criar atalho na área de trabalho"
    Pop $DitadoDesktopCheckbox
    ${NSD_SetState} $DitadoDesktopCheckbox $DitadoCreateDesktop
    ${NSD_CreateCheckbox} 0 20u 100% 12u "Iniciar o Ditado junto com o Windows"
    Pop $DitadoStartupCheckbox
    ${NSD_SetState} $DitadoStartupCheckbox $DitadoStartWithWindows
    nsDialogs::Show
  FunctionEnd

  Function DitadoOptionsLeave
    ${NSD_GetState} $DitadoDesktopCheckbox $DitadoCreateDesktop
    ${NSD_GetState} $DitadoStartupCheckbox $DitadoStartWithWindows
  FunctionEnd
!macroend

!macro customInstall
  ${If} $DitadoCreateDesktop == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    WinShell::SetLnkAUMI "$DESKTOP\${PRODUCT_FILENAME}.lnk" "${APP_ID}"
  ${Else}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  ${EndIf}
  ${If} $DitadoStartWithWindows == ${BST_CHECKED}
    WriteRegStr HKCU "${DITADO_RUN_KEY}" "${DITADO_RUN_VALUE}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${Else}
    DeleteRegValue HKCU "${DITADO_RUN_KEY}" "${DITADO_RUN_VALUE}"
  ${EndIf}
!macroend

!macro customUnInstall
  ; numa atualização o desinstalador antigo roda antes do novo instalador: só limpa na desinstalação de verdade
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    DeleteRegValue HKCU "${DITADO_RUN_KEY}" "${DITADO_RUN_VALUE}"
  ${EndIf}
!macroend
