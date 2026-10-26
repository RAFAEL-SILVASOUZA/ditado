# Privacidade

O Ditado transcreve áudio localmente usando modelos Whisper executados no computador. O código do aplicativo não envia gravações para uma API de transcrição e não implementa telemetria de uso.

- **Rede:** é necessária para baixar os modelos do Hugging Face. Depois do download, a transcrição utiliza os arquivos locais.
- **Microfone:** o áudio capturado é processado para transcrição; o aplicativo não implementa armazenamento persistente de gravações.
- **Texto:** o resultado é copiado para a área de transferência e, se ativado, colado no aplicativo em foco. Outros programas podem acessar o clipboard.
- **Configurações:** o Ditado salva preferências e modelos no diretório local de dados do usuário.

**Atenção:** se você mudar de janela durante a transcrição, a colagem automática pode inserir o texto no aplicativo errado. Desative-a para conteúdos sensíveis.

Esta descrição refere-se ao aplicativo, não aos programas de destino nem ao sistema operacional.
