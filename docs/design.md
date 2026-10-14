# Ditado: design

App de bandeja (Windows e macOS) que transforma fala em texto com Whisper rodando localmente e cola o
resultado no app que estava em foco. Nasceu do ditado do chat do Agent Platform (`master-agent`), de onde
vêm o motor de transcrição, o catálogo/download de modelos e a gravação com a onda.

## Comportamento

- Fica na bandeja (Windows) / barra de menu (macOS). Menu: Ditar, Configurações, Sair.
- **Atalho global configurável** (padrão `CommandOrControl+Shift+Space`), no modo liga/desliga:
  1ª vez abre a janelinha e começa a gravar; 2ª vez confirma (igual ao ✓).
- **Esc** cancela (igual ao ✕). É registrado como atalho global só enquanto a janelinha está aberta,
  porque ela nunca recebe o foco.
- Ao confirmar: transcreve, põe o texto na **área de transferência** e **simula Ctrl+V / ⌘V** no app em foco
  (a colagem automática pode ser desligada). Se colar falhar (macOS sem Acessibilidade), o texto continua
  na área de transferência e a janelinha avisa.
- Sem modelo escolhido, a janelinha avisa e oferece abrir as configurações.

## Janelinha (overlay)

Sem moldura, transparente, sempre por cima, ~280×44, canto superior direito do monitor do cursor, arrastável
(posição lembrada). **Não recebe foco** (`focusable: false`, `showInactive`; `type: 'panel'` no macOS),
para o app de destino continuar em foco. Estados: gravando (onda + ✕ ✓), transcrevendo, erro (some sozinho).

## Modelos

Whisper ONNX do `onnx-community` no Hugging Face via `@huggingface/transformers` (onnxruntime-node).
Cada modelo do catálogo fixa `device` e `dtype`:

| Faixa | Modelo | dtype | device |
|---|---|---|---|
| CPU | Tiny, Base, Small, Large v3 Turbo | q8 | cpu |
| GPU pequena (2–4 GB) | Small, Large v3 Turbo | fp16 / q4f16 | gpu |
| GPU grande (6 GB+) | Large v3 Turbo, Large v3 | fp16 | gpu |

`gpu` vira `dml` (DirectML) no Windows e `coreml` no macOS. Se a GPU falhar ao carregar, o transcritor
recarrega o mesmo modelo na CPU e informa (`usedFallback`) — a janelinha mostra o aviso.

Cada modelo tem a sua pasta `<userData>/models/<id>/`; o download vai para `<id>.part/` e só é renomeado
quando todos os arquivos chegaram.

## Arquitetura

```
main
├─ index.ts           ciclo de vida, instância única, IPC
├─ settings.ts        JSON em userData (atalho, modelo, idioma, colar, abrir com o sistema, posição)
├─ shortcuts.ts       registra/troca o atalho; Esc enquanto o overlay está aberto
├─ windows.ts         overlay + janela de configurações
├─ tray.ts
├─ speech/            model-catalog, model-manager, transcriber, devices
└─ system/            paste (clipboard + tecla), permissions (microfone, Acessibilidade)
renderer
├─ overlay/           gravação (useRecorder) + onda + ✕ ✓
└─ settings/          abas Atalho | Modelos | Geral
```

O overlay controla a própria máquina de estados; o main só manda `toggle`/`cancel` e recebe
`deliver(text)` (cola e esconde) ou `dismiss()` (esconde).

## Fora do escopo (v1)

Segurar para falar (exige hook de teclado nativo), streaming de texto enquanto fala, assinatura/notarização.
