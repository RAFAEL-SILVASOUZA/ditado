/** Erro com código e mensagem pronta para o usuário; o IPC repassa os dois para a tela. */
export class AppError extends Error {
  constructor(
    readonly code: 'VALIDATION' | 'NOT_FOUND' | 'TOO_LARGE' | 'CONFLICT',
    message: string
  ) {
    super(message)
  }
}
