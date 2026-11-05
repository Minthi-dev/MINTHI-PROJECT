import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Callout } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reimposta-password` })
    setBusy(false)
    setSent(true) // sempre: non riveliamo se l'email esiste
  }

  return (
    <AuthLayout title="Recupera la password" description="Ti inviamo un link per sceglierne una nuova." footer={<Link to="/accedi" className="hover:text-foreground">Torna all'accesso</Link>}>
      {sent ? (
        <Callout tone="success" title="Controlla la tua email">Se l'indirizzo è registrato riceverai un link entro pochi minuti.</Callout>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Email" htmlFor="email" hint="I camerieri chiedono il reset al titolare.">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={busy}>Invia link</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // il link di recupero crea una sessione temporanea
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' || s) setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Almeno 8 caratteri.')
    if (password !== confirm) return setError('Le password non coincidono.')
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    toast.success('Password aggiornata')
    navigate('/app', { replace: true })
  }

  return (
    <AuthLayout title="Nuova password">
      {!ready ? (
        <Callout tone="warning" title="Link non valido o scaduto">Richiedi un nuovo link dalla pagina <Link className="underline" to="/password-dimenticata">password dimenticata</Link>.</Callout>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Nuova password" htmlFor="p1"><Input id="p1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Ripeti password" htmlFor="p2" error={error ?? undefined}><Input id="p2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" size="lg" loading={busy}>Salva password</Button>
        </form>
      )}
    </AuthLayout>
  )
}
