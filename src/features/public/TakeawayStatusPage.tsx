import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChefHat, Clock, CreditCard, PackageCheck, XCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PublicLayout, PublicMessage } from '@/features/customer/PublicLayout'
import { callFunction, rpc } from '@/shared/lib/api'
import { cn } from '@/shared/lib/cn'
import { formatMoney, formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Card, Spinner } from '@/shared/ui/display'
import { usePublicRestaurant } from './TakeawayMenuPage'

interface Order {
  id: string; restaurantId: string; status: string; paymentStatus: string; pickupNumber: number; pickupCode: string; total: number
  createdAt: string; readyAt: string | null; estimatedMinutes: number; customerName: string | null
  items: { name: string; quantity: number; unitPrice: number }[]
}

const STEPS = [
  { key: 'received', label: 'Ricevuto', icon: Clock },
  { key: 'preparing', label: 'In preparazione', icon: ChefHat },
  { key: 'ready', label: 'Pronto', icon: PackageCheck },
]

export function TakeawayStatusPage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const order = useQuery({
    queryKey: ['takeaway-order', token],
    queryFn: async () => (await rpc('get_takeaway_order', { p_token: token })) as unknown as Order | null,
    refetchInterval: (q) => (['picked_up', 'cancelled'].includes(q.state.data?.status ?? '') ? false : 5000),
  })
  const o = order.data
  const info = usePublicRestaurant(o?.restaurantId ?? '')
  const [qr, setQr] = useState('')
  useEffect(() => { QRCode.toDataURL(`${location.origin}/asporto/ordine/${token}`, { width: 360, margin: 1 }).then(setQr) }, [token])
  const pay = useMutation({ mutationFn: () => callFunction<{ url: string }>('checkout', { kind: 'takeaway', token }), onSuccess: (d) => { window.location.href = d.url } })

  if (order.isLoading) return <Spinner className="min-h-dvh" />
  if (!o) return <PublicMessage title="Ordine non trovato" />
  const r = info.data
  const step = STEPS.findIndex((s) => s.key === o.status)
  const showQr = r?.takeaway.pickupMode === 'qr'

  return (
    <PublicLayout accent={r?.theme?.accent} name={r?.name} logoUrl={r?.logoUrl} subtitle="Il tuo ordine">
      <main className="mx-auto grid max-w-md gap-5 px-4 py-6">
        {params.get('pagamento') === 'ok' && o.paymentStatus !== 'paid' && <Callout tone="info">Stiamo confermando il pagamento…</Callout>}
        {o.status === 'cancelled' ? (
          <PublicMessage icon={<XCircle className="size-6 text-danger" />} title="Ordine annullato">Per informazioni contatta il locale{r?.phone ? ` al ${r.phone}` : ''}.</PublicMessage>
        ) : o.status === 'awaiting_payment' ? (
          <Card className="grid gap-3 p-5 text-center">
            <p className="font-semibold">Manca il pagamento</p>
            <p className="text-sm text-muted-foreground">L'ordine verrà preparato dopo il pagamento online.</p>
            <Button size="lg" onClick={() => pay.mutate()} loading={pay.isPending}><CreditCard />Paga {formatMoney(o.total)}</Button>
          </Card>
        ) : (
          <>
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Il tuo numero</p>
              <p className="text-7xl font-bold tracking-tight tabular">{o.pickupNumber}</p>
              {o.status === 'picked_up' ? <p className="mt-2 flex items-center justify-center gap-1.5 font-medium text-success"><CheckCircle2 className="size-5" />Ritirato, buon appetito!</p>
                : o.status === 'ready' ? <p className="mt-2 text-lg font-semibold text-success">È pronto! Vieni al banco</p>
                : <p className="mt-2 text-muted-foreground">Pronto verso le {formatTime(new Date(new Date(o.createdAt).getTime() + o.estimatedMinutes * 60000))}</p>}
              {showQr && o.status !== 'picked_up' && qr && <img src={qr} alt="QR per il ritiro" className="mx-auto mt-4 w-44 rounded-xl border bg-white p-2" />}
              <p className="mt-3 text-sm text-muted-foreground">Codice ritiro: <span className="font-mono font-semibold text-foreground">{o.pickupCode}</span></p>
            </Card>
            {o.status !== 'picked_up' && (
              <ol className="grid grid-cols-3 gap-2">
                {STEPS.map((s, i) => (
                  <li key={s.key} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium', i <= step ? 'border-primary bg-accent text-accent-foreground' : 'text-muted-foreground')}>
                    <s.icon className="size-5" />{s.label}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <Card>
          <ul className="divide-y">{o.items.map((it, i) => <li key={i} className="flex justify-between px-4 py-2.5 text-sm"><span>{it.quantity}× {it.name}</span><span className="tabular">{formatMoney(it.unitPrice * it.quantity)}</span></li>)}</ul>
          <div className="flex justify-between border-t px-4 py-3 font-semibold"><span>Totale {o.paymentStatus === 'paid' ? '· pagato' : '· da pagare al ritiro'}</span><span className="tabular">{formatMoney(o.total)}</span></div>
        </Card>
        <p className="text-center text-xs text-muted-foreground">Tieni aperta questa pagina: si aggiorna da sola.</p>
      </main>
    </PublicLayout>
  )
}
