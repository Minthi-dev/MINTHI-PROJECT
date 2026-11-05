import { useMutation } from '@tanstack/react-query'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { roleLabel } from '@/features/shell/UserMenu'
import { unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { useTheme } from '@/shared/hooks/useTheme'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader, PageHeader } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'

export function AccountPage() {
  const { profile, session, current, refresh } = useAuth()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [pw, setPw] = useState({ a: '', b: '' })

  const saveName = useMutation({
    mutationFn: async () => unwrap(await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session!.user.id).select('id').single()),
    onSuccess: () => { refresh(); toast.success('Nome aggiornato') },
  })
  const savePw = useMutation({
    mutationFn: async () => {
      if (pw.a.length < 8) throw new Error('Almeno 8 caratteri.')
      if (pw.a !== pw.b) throw new Error('Le password non coincidono.')
      const { error } = await supabase.auth.updateUser({ password: pw.a })
      if (error) throw error
    },
    onSuccess: () => { setPw({ a: '', b: '' }); toast.success('Password aggiornata') },
  })

  return (
    <div className="max-w-2xl">
      <PageHeader title="Il mio account" description={`${profile?.username ? `@${profile.username}` : session?.user.email} · ${roleLabel(current?.role)}`} />
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Profilo" />
          <CardBody>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); saveName.mutate() }}>
              <Field label="Nome" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Button type="submit" variant="outline" loading={saveName.isPending}>Salva</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Aspetto" />
          <CardBody>
            <Segmented value={theme} onChange={setTheme} options={[
              { value: 'light', label: <span className="flex items-center gap-1.5"><Sun className="size-4" />Chiaro</span> },
              { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon className="size-4" />Scuro</span> },
              { value: 'system', label: <span className="flex items-center gap-1.5"><Monitor className="size-4" />Automatico</span> },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cambia password" />
          <CardBody>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); savePw.mutate() }}>
              <Field label="Nuova password"><Input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
              <Field label="Ripeti"><Input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
              <Button type="submit" className="justify-self-start" loading={savePw.isPending}>Aggiorna password</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
