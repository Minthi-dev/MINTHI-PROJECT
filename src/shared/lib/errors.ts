import type { PostgrestError } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/supabase-js'

export class AppError extends Error {
  constructor(message: string, public code = 'error') {
    super(message)
  }
}

/** Converte errori di Postgres/RPC (raise_app_error usa il campo hint come codice). */
export function fromPostgrest(error: PostgrestError): AppError {
  if (error.code === 'P0001') return new AppError(error.message, error.hint || 'error')
  if (error.code === '42501') return new AppError('Non hai i permessi per questa operazione.', 'forbidden')
  if (error.code === '23505') return new AppError('Esiste già un elemento con questi dati.', 'duplicate')
  if (error.code === '23503') return new AppError('Elemento collegato ad altri dati: impossibile completare.', 'in_use')
  return new AppError('Qualcosa è andato storto. Riprova.', error.code)
}

export async function fromFunctions(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      return new AppError(body.error ?? 'Errore del server.', body.code ?? 'error')
    } catch {
      return new AppError('Errore del server.')
    }
  }
  return new AppError(error instanceof Error ? error.message : 'Errore di rete.')
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Qualcosa è andato storto.'
}
