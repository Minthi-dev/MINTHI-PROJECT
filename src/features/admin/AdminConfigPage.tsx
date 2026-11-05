import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Card, CardBody, CardHeader, PageHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { useAdminAction } from './queries'

/** Contenuti pubblici della landing (contatti, prezzo). */
export function AdminConfigPage() {
  const cfg = useQuery({ queryKey: ['admin', 'config'], queryFn: async () => unwrap(await supabase.from('platform_config').select('*')) })
  const save = useAdminAction('Configurazione salvata')
  const [f, setF] = useState({ contact_whatsapp: '', contact_email: '', plan_price: '' })
  useEffect(() => {
    if (!cfg.data) return
    const get = (k: string) => String(cfg.data.find((c) => c.key === k)?.value ?? '')
    setF({ contact_whatsapp: get('contact_whatsapp'), contact_email: get('contact_email'), plan_price: get('plan_price') })
  }, [cfg.data])
  if (!cfg.data) return <Skeleton className="h-64" />
  return (
    <>
      <PageHeader title="Configurazione" />
      <Card className="max-w-xl">
        <CardHeader title="Landing page" description="Valori pubblici mostrati sul sito." />
        <CardBody>
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault()
            for (const [key, value] of Object.entries(f)) await save.mutateAsync({ action: 'set_config', key, value, isPublic: true })
          }}>
            <Field label="WhatsApp (numero internazionale)" hint="Es. 393331234567"><Input value={f.contact_whatsapp} onChange={(e) => setF({ ...f, contact_whatsapp: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Email contatti"><Input type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></Field>
            <Field label="Prezzo mensile mostrato" hint="Es. 49 € / mese. Vuoto per nasconderlo."><Input value={f.plan_price} onChange={(e) => setF({ ...f, plan_price: e.target.value })} /></Field>
            <Button type="submit" className="justify-self-start" loading={save.isPending}>Salva</Button>
          </form>
        </CardBody>
      </Card>
    </>
  )
}
