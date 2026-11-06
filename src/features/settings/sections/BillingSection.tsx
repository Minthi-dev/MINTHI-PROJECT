import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Badge, Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' }> = {
  trialing: { label: 'Periodo gratuito', tone: 'brand' },
  active: { label: 'Attivo', tone: 'success' },
  free: { label: 'Gratuito', tone: 'brand' },
  past_due: { label: 'Pagamento in ritardo', tone: 'warning' },
  canceled: { label: 'Disdetto', tone: 'danger' },
}

const EMPTY = { billing_name: '', vat_number: '', tax_code: '', address: '', city: '', postal_code: '', province: '', sdi_code: '', pec: '' }

export function BillingSection() {
  const r = useRestaurant()
  const qc = useQueryClient()
  const billing = useQuery({ queryKey: ['r', r.id, 'billing'], queryFn: async () => unwrap(await supabase.from('billing_accounts').select('*').eq('restaurant_id', r.id).maybeSingle()) })
  const payments = useQuery({ queryKey: ['r', r.id, 'billing', 'payments'], queryFn: async () => unwrap(await supabase.from('subscription_payments').select('*').eq('restaurant_id', r.id).order('created_at', { ascending: false })) })
  const [f, setF] = useState(EMPTY)

  useEffect(() => {
    const b = billing.data
    if (b) setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (b as Record<string, unknown>)[k] ?? ''])) as typeof EMPTY)
  }, [billing.data])

  const save = useMutation({
    mutationFn: async () => unwrap(await supabase.from('billing_accounts')
      .update(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])))
      .eq('restaurant_id', r.id).select().single()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['r', r.id, 'billing'] }); toast.success('Dati di fatturazione salvati') },
  })

  if (billing.isLoading) return <Skeleton className="h-96" />
  const b = billing.data
  const st = STATUS[b?.subscription_status ?? 'active'] ?? STATUS.active
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Abbonamento MINTHI" actions={<Badge tone={st.tone}>{st.label}</Badge>} />
        <CardBody className="text-sm">
          {b?.current_period_end
            ? <p>{b.subscription_status === 'trialing' ? 'Gratuito fino al' : 'Rinnovo il'} <strong>{formatDate(b.current_period_end)}</strong></p>
            : <p className="text-muted-foreground">Per modifiche al piano scrivi all'assistenza MINTHI.</p>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Dati di fatturazione" description="Usati per le fatture dell'abbonamento." />
        <CardBody>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
            <Field label="Ragione sociale"><Input value={f.billing_name} onChange={set('billing_name')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Partita IVA"><Input value={f.vat_number} onChange={set('vat_number')} /></Field>
              <Field label="Codice fiscale"><Input value={f.tax_code} onChange={set('tax_code')} /></Field>
            </div>
            <Field label="Indirizzo"><Input value={f.address} onChange={set('address')} /></Field>
            <div className="grid grid-cols-[1fr_100px_80px] gap-3">
              <Field label="Città"><Input value={f.city} onChange={set('city')} /></Field>
              <Field label="CAP"><Input value={f.postal_code} onChange={set('postal_code')} /></Field>
              <Field label="Prov."><Input maxLength={2} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value.toUpperCase() })} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Codice SDI"><Input maxLength={7} value={f.sdi_code} onChange={(e) => setF({ ...f, sdi_code: e.target.value.toUpperCase() })} /></Field>
              <Field label="PEC"><Input type="email" value={f.pec} onChange={set('pec')} /></Field>
            </div>
            <Button type="submit" className="justify-self-start" loading={save.isPending} disabled={!b}>Salva</Button>
          </form>
        </CardBody>
      </Card>
      {!!payments.data?.length && (
        <Card>
          <CardHeader title="Pagamenti" />
          <ul className="divide-y">
            {payments.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{formatDate(p.created_at)}{p.period_end ? ` · fino al ${formatDate(p.period_end)}` : ''}</span>
                <span className="font-medium tabular">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
