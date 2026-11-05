// Wrapper tipizzati attorno a RPC ed Edge Functions con errori leggibili.
import type { Database } from '@/types/database'
import { supabase } from './supabase'
import { fromFunctions, fromPostgrest } from './errors'

type Fns = Database['public']['Functions']

export async function rpc<N extends keyof Fns>(name: N, args?: Fns[N]['Args']): Promise<Fns[N]['Returns']> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args ?? {})
  if (error) throw fromPostgrest(error)
  return data as Fns[N]['Returns']
}

export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw await fromFunctions(error)
  return data as T
}

/** Lancia l'errore di una query PostgREST e restituisce i dati. */
export function unwrap<R extends { data: unknown; error: import('@supabase/supabase-js').PostgrestError | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw fromPostgrest(res.error)
  return res.data as NonNullable<R['data']>
}
