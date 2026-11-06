import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { callFunction, rpc } from '@/shared/lib/api'
import { errorMessage } from '@/shared/lib/errors'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Callout, Spinner } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { AuthLayout } from './AuthLayout'

interface Invite { valid: boolean; freeMonths: number; discountPercent: number }

export function RegisterPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invite = useQuery({ queryKey: ['invite', token], queryFn: async () => (await rpc('check_invite', { p_token: token })) as unknown as Invite | null })
  const [form, setForm] = useState({ fullName: '', email: '', password: '', restaurantName: '', phone: '', address: '', vatNumber: '', billingName: '', sdiCode: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await callFunction('register', {
        token, fullName: form.fullName, email: form.email, password: form.password, restaurantName: form.restaurantName,
        phone: form.phone || undefined, address: form.address || undefined,
        billing: { vatNumber: form.vatNumber || undefined, billingName: form.billingName || undefined, sdiCode: form.sdiCode || undefined },
      })
      const { error: err } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password })
      if (err) throw err
      toast.success('Benvenuto in MINTHI!')
      navigate('/app/impostazioni/locale?benvenuto=1', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (invite.isLoading) return <Spinner className="min-h-dvh" />
  if (!invite.data) {
    return (
      <AuthLayout title="Invito non valido" footer={<Link to="/" className="hover:text-foreground">Vai al sito</Link>}>
        <Callout tone="warning">Il link è scaduto o è già stato usato. Contatta MINTHI per riceverne uno nuovo.</Callout>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Crea il tuo locale" description="Bastano due minuti, il resto lo configuri dopo.">
      {invite.data.freeMonths > 0 && (
        <Callout tone="success" icon={Gift} className="mb-5" title={`${invite.data.freeMonths} ${invite.data.freeMonths === 1 ? 'mese gratuito' : 'mesi gratuiti'} inclusi`} />
      )}
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nome del locale" htmlFor="rn"><Input id="rn" required value={form.restaurantName} onChange={set('restaurantName')} /></Field>
        <Field label="Il tuo nome" htmlFor="fn"><Input id="fn" required autoComplete="name" value={form.fullName} onChange={set('fullName')} /></Field>
        <Field label="Email" htmlFor="em"><Input id="em" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" htmlFor="pw" hint="Almeno 8 caratteri."><Input id="pw" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <Field label="Telefono" htmlFor="ph" optional><Input id="ph" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></Field>
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Dati di fatturazione (facoltativi)</summary>
          <div className="mt-3 grid gap-3">
            <Field label="Ragione sociale" htmlFor="bn"><Input id="bn" value={form.billingName} onChange={set('billingName')} /></Field>
            <Field label="Partita IVA" htmlFor="vat"><Input id="vat" inputMode="numeric" value={form.vatNumber} onChange={set('vatNumber')} /></Field>
            <Field label="Codice SDI" htmlFor="sdi"><Input id="sdi" value={form.sdiCode} onChange={set('sdiCode')} /></Field>
            <Field label="Indirizzo" htmlFor="addr"><Input id="addr" value={form.address} onChange={set('address')} /></Field>
          </div>
        </details>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={busy}>Crea account</Button>
      </form>
    </AuthLayout>
  )
}
