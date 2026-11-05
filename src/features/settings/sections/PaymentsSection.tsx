import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { callFunction, unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { SwitchRow } from '@/shared/ui/controls'
import { Badge, Callout, Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'

interface Status { connected: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean; mode: 'live' | 'test' }

export function PaymentsSection() {
  const r = useRestaurant()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const status = useQuery({ queryKey: ['r', r.id, 'stripe'], queryFn: () => callFunction<Status>('stripe-connect', { action: 'refresh', restaurantId: r.id }) })
  const account = useQuery({ queryKey: ['r', r.id, 'stripe-row'], queryFn: async () => unwrap(await supabase.from('stripe_accounts').select('*').eq('restaurant_id', r.id).maybeSingle()) })
  const go = useMutation({ mutationFn: (action: 'onboarding_link' | 'dashboard_link') => callFunction<{ url: string }>('stripe-connect', { action, restaurantId: r.id }), onSuccess: (d) => { window.location.href = d.url } })
  const toggle = useMutation({
    mutationFn: async (v: boolean) => unwrap(await supabase.from('stripe_accounts').update({ online_payments_enabled: v }).eq('restaurant_id', r.id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['r', r.id, 'stripe-row'] }),
  })
  useEffect(() => { if (params.get('stripe')) status.refetch() }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = status.data
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Pagamenti online con Stripe" description="I clienti pagano il conto o l'asporto con carta, Apple Pay e Google Pay. I soldi arrivano direttamente sul tuo conto."
          actions={s && <Badge tone={s.mode === 'live' ? 'success' : 'warning'}>{s.mode === 'live' ? 'Modalità reale' : 'Modalità test'}</Badge>} />
        <CardBody className="grid gap-4">
          {!s ? <Skeleton className="h-20" /> : !s.connected ? (
            <>
              <p className="text-sm text-muted-foreground">Crea il tuo account Stripe in pochi minuti: servono i dati dell'attività, un documento e l'IBAN.</p>
              <Button className="justify-self-start" onClick={() => go.mutate('onboarding_link')} loading={go.isPending}><CreditCard />Collega Stripe</Button>
            </>
          ) : (
            <>
              <ul className="grid gap-2 text-sm">
                <Check ok={!!s.details_submitted} label="Dati dell'attività inviati" />
                <Check ok={!!s.charges_enabled} label="Può ricevere pagamenti" />
                <Check ok={!!s.payouts_enabled} label="Bonifici sul conto attivi" />
              </ul>
              {!s.charges_enabled && <Callout tone="warning" title="Configurazione da completare">Stripe richiede ancora alcune informazioni.</Callout>}
              <div className="flex flex-wrap gap-2">
                {!s.charges_enabled && <Button onClick={() => go.mutate('onboarding_link')} loading={go.isPending}>Completa su Stripe</Button>}
                {s.details_submitted && <Button variant="outline" onClick={() => go.mutate('dashboard_link')} loading={go.isPending}><ExternalLink />Dashboard Stripe</Button>}
                <Button variant="ghost" onClick={() => status.refetch()} loading={status.isFetching}><RefreshCw />Aggiorna stato</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
      {s?.charges_enabled && account.data && (
        <Card>
          <CardBody>
            <SwitchRow title="Accetta pagamenti online" description="Mostra ai clienti il pulsante 'Paga con carta' sul conto del tavolo e nell'asporto." checked={account.data.online_payments_enabled} onCheckedChange={(v) => toggle.mutate(v)} />
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center gap-2"><CheckCircle2 className={ok ? 'size-4 text-success' : 'size-4 text-muted-foreground/40'} />{label}</li>
}
