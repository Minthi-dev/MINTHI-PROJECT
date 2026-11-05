import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { rpc } from '@/shared/lib/api'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

export function PinGate({ token, tableName, onJoined }: { token: string; tableName: string; onJoined: () => void }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => refs.current[0]?.focus(), [])

  const submit = async (pin: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = (await rpc('join_table', { p_qr_token: token, p_pin: pin })) as { error?: string; message?: string; attemptsLeft?: number; sessionId?: string }
      if (res.error) {
        setError(`${res.message}${res.attemptsLeft !== undefined ? ` Tentativi rimasti: ${res.attemptsLeft}.` : ''}`)
        setDigits(['', '', '', ''])
        refs.current[0]?.focus()
      } else onJoined()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '')
    if (clean.length > 1) {
      // incolla l'intero PIN
      const all = clean.slice(0, 4).split('')
      const next = [0, 1, 2, 3].map((k) => all[k] ?? '')
      setDigits(next)
      if (all.length === 4) void submit(next.join(''))
      return
    }
    const next = digits.map((d, k) => (k === i ? clean : d))
    setDigits(next)
    if (clean && i < 3) refs.current[i + 1]?.focus()
    if (next.every(Boolean)) void submit(next.join(''))
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-4 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent"><Lock className="size-6 text-accent-foreground" /></span>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Tavolo {tableName}</h1>
        <p className="text-muted-foreground">Inserisci il PIN di 4 cifre che ti ha dato il personale.</p>
      </div>
      <div className="flex gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            value={d}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            aria-label={`Cifra ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus() }}
            className={cn('h-16 w-14 rounded-xl border-2 bg-surface text-center text-3xl font-bold tabular outline-none focus:border-primary', error && 'border-danger')}
            disabled={busy}
          />
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="w-full" loading={busy} disabled={digits.some((x) => !x)} onClick={() => submit(digits.join(''))}>Entra</Button>
    </div>
  )
}
