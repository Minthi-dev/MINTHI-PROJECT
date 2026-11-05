import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/button'
import { Field, Input } from '@/shared/ui/input'
import { useAuth } from './AuthProvider'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { session, isAnonymous, signIn, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const next = params.get('da') || '/app'

  if (!loading && session && !isAnonymous) return <Navigate to={next} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(identifier, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Accedi a MINTHI" description="Titolari con email, staff con il proprio username." footer={<>Sei un cliente? Inquadra il QR sul tavolo.</>}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Email o username" htmlFor="identifier">
          <Input id="identifier" autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="nome@locale.it oppure mario" />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground" aria-label={show ? 'Nascondi password' : 'Mostra password'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={busy}>Accedi</Button>
        <Link to="/password-dimenticata" className="text-center text-sm text-muted-foreground hover:text-foreground">Password dimenticata?</Link>
      </form>
    </AuthLayout>
  )
}
