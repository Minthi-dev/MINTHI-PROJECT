import { Banknote, ChevronRight, CreditCard, ExternalLink, MonitorPlay, MoreVertical, Package, Phone, Printer, QrCode, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { playChime } from '@/features/kitchen/sound'
import { usePrinter } from '@/features/printing/usePrinter'
import { useTakeawaySettings } from '@/features/settings/queries'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { elapsed, formatDateTime, formatMoney, formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Badge, EmptyState, PageHeader, Skeleton, Tabs } from '@/shared/ui/display'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useConfirm } from '@/shared/ui/overlay'
import { PickupScanner } from './PickupScanner'
import { useRefund, useSetTakeawayStatus, useTakeawayOrders, useTakeawayPayment, type TakeawayOrder } from './queries'

const COLUMNS = [
  { key: 'received', title: 'Nuovi', next: 'preparing', action: 'Inizia' },
  { key: 'preparing', title: 'In preparazione', next: 'ready', action: 'Pronto' },
  { key: 'ready', title: 'Pronti al ritiro', next: 'picked_up', action: 'Ritirato' },
] as const

export function TakeawayBoardPage() {
  const r = useRestaurant()
  const [tab, setTab] = useState<'board' | 'history'>('board')
  const [scanner, setScanner] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const active = useTakeawayOrders('active')
  const history = useTakeawayOrders('history')
  const settings = useTakeawaySettings()
  const printer = usePrinter()
  const known = useRef<Set<string> | null>(null)

  const orders = active.data ?? []
  const awaiting = orders.filter((o) => o.status === 'awaiting_payment')

  useEffect(() => {
    if (!active.data) return
    const ids = new Set(active.data.filter((o) => o.status !== 'awaiting_payment').map((o) => o.id))
    if (known.current) {
      const fresh = active.data.filter((o) => ids.has(o.id) && !known.current!.has(o.id))
      if (fresh.length) {
        playChime()
        if (settings.data?.auto_print) fresh.forEach((o) => printTicket(o))
      }
    }
    known.current = ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.data])

  const printTicket = (o: TakeawayOrder) => printer.printTakeaway({
    number: o.pickup_number, code: o.pickup_code, customer: [o.customer_first_name, o.customer_last_name].filter(Boolean).join(' ') || null,
    items: o.order_items.filter((i) => i.status !== 'cancelled').map((i) => ({ name: i.dish_name, quantity: i.quantity, notes: i.notes, unitPrice: Number(i.unit_price) })),
    total: Number(o.total), paid: o.payment_status === 'paid', notes: o.customer_notes,
  })

  return (
    <>
      <PageHeader
        title="Asporto"
        description="Gli ordini online arrivano qui in tempo reale."
        actions={<>
          <Button variant="outline" asChild><a href={`/display/${r.id}`} target="_blank" rel="noreferrer"><MonitorPlay />Schermo clienti</a></Button>
          <Button variant="outline" asChild><a href={`/asporto/${r.id}`} target="_blank" rel="noreferrer"><ExternalLink />Menu online</a></Button>
          <Button onClick={() => setScanner(true)}><QrCode />Ritiro</Button>
        </>}
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: 'board', label: 'In corso', count: orders.length - awaiting.length }, { value: 'history', label: 'Storico 7 giorni' }]} />

      {tab === 'board' ? (
        active.isLoading ? <Skeleton className="h-80" /> : (
          <>
            {awaiting.length > 0 && (
              <p className="mb-4 text-sm text-muted-foreground">{awaiting.length} {awaiting.length === 1 ? 'ordine' : 'ordini'} in attesa del pagamento online (non ancora da preparare).</p>
            )}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {COLUMNS.map((col) => {
                const list = orders.filter((o) => o.status === col.key)
                return (
                  <section key={col.key} className="rounded-2xl bg-muted/60 p-3">
                    <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">{col.title}<span className="rounded-full bg-surface px-2 text-xs tabular">{list.length}</span></h2>
                    <div className="grid gap-3">
                      {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nessun ordine</p>}
                      {list.map((o) => <OrderCard key={o.id} order={o} column={col} highlighted={highlight === o.id} onPrint={() => printTicket(o)} />)}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )
      ) : (
        <HistoryList orders={history.data ?? []} loading={history.isLoading} />
      )}

      <PickupScanner open={scanner} onClose={() => setScanner(false)} onFound={(id) => { setScanner(false); setTab('board'); setHighlight(id); setTimeout(() => document.getElementById(`ta-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }} />
    </>
  )
}

function OrderCard({ order: o, column, highlighted, onPrint }: { order: TakeawayOrder; column: (typeof COLUMNS)[number]; highlighted: boolean; onPrint: () => void }) {
  const r = useRestaurant()
  const now = useNow()
  const setStatus = useSetTakeawayStatus()
  const pay = useTakeawayPayment()
  const refund = useRefund()
  const confirm = useConfirm()
  const items = o.order_items.filter((i) => i.status !== 'cancelled')
  const paid = o.payment_status === 'paid'
  const stripePayment = o.payments.find((p) => p.method === 'stripe' && p.status === 'succeeded')
  const name = [o.customer_first_name, o.customer_last_name].filter(Boolean).join(' ')

  const advance = async () => {
    if (column.next === 'picked_up' && !paid) {
      const ok = await confirm({ title: 'Ordine non pagato', description: 'Registra prima il pagamento oppure consegna comunque.', confirmLabel: 'Consegna senza pagamento' })
      if (!ok) return
    }
    setStatus.mutate({ id: o.id, status: column.next })
  }

  return (
    <article id={`ta-${o.id}`} className={cn('rounded-xl border bg-surface p-3.5 shadow-sm transition-shadow', highlighted && 'ring-2 ring-primary')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tracking-tight tabular">#{o.pickup_number}</p>
          <p className="text-xs text-muted-foreground">{formatTime(o.created_at)} · {elapsed(o.created_at, now)} · {o.pickup_code}</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={paid ? 'success' : 'warning'}>{paid ? (stripePayment ? 'Pagato online' : 'Pagato') : 'Da pagare'}</Badge>
          <Menu>
            <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni"><MoreVertical /></Button></MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={onPrint}><Printer />Stampa scontrino cucina</MenuItem>
              {!paid && r.canTakePayments && <>
                <MenuItem onSelect={() => pay.mutate({ id: o.id, method: 'cash' })}><Banknote />Pagato in contanti</MenuItem>
                <MenuItem onSelect={() => pay.mutate({ id: o.id, method: 'card' })}><CreditCard />Pagato con carta</MenuItem>
              </>}
              {column.key !== 'received' && <MenuItem onSelect={() => setStatus.mutate({ id: o.id, status: column.key === 'ready' ? 'preparing' : 'received' })}><RotateCcw />Torna indietro</MenuItem>}
              <MenuSeparator />
              {stripePayment && r.isManager && (
                <MenuItem danger onSelect={async () => {
                  if (await confirm({ title: 'Rimborsare l\'ordine?', description: `${formatMoney(stripePayment.amount)} verranno restituiti sulla carta del cliente.`, confirmLabel: 'Rimborsa', danger: true })) {
                    await refund.mutateAsync({ paymentId: stripePayment.id })
                    setStatus.mutate({ id: o.id, status: 'cancelled' })
                  }
                }}><RotateCcw />Rimborsa e annulla</MenuItem>
              )}
              {(!paid || !stripePayment) && (
                <MenuItem danger onSelect={async () => {
                  if (await confirm({ title: `Annullare l'ordine #${o.pickup_number}?`, confirmLabel: 'Annulla ordine', danger: true })) setStatus.mutate({ id: o.id, status: 'cancelled' })
                }}><X />Annulla ordine</MenuItem>
              )}
            </MenuContent>
          </Menu>
        </div>
      </div>
      {(name || o.customer_phone) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
          {name && <span className="font-medium">{name}</span>}
          {o.customer_phone && <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Phone className="size-3.5" />{o.customer_phone}</a>}
        </p>
      )}
      <ul className="mt-2 grid gap-1 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <span className="font-semibold tabular">{i.quantity}×</span> {i.dish_name}
            {i.notes && <span className="block pl-5 text-xs text-muted-foreground">“{i.notes}”</span>}
          </li>
        ))}
      </ul>
      {o.customer_notes && <p className="mt-2 rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs text-warning-foreground">{o.customer_notes}</p>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="font-semibold tabular">{formatMoney(o.total)}</span>
        <Button size="sm" onClick={advance} loading={setStatus.isPending}>{column.action}<ChevronRight /></Button>
      </div>
    </article>
  )
}

function HistoryList({ orders, loading }: { orders: TakeawayOrder[]; loading: boolean }) {
  const total = useMemo(() => orders.filter((o) => o.status === 'picked_up').reduce((s, o) => s + Number(o.total), 0), [orders])
  if (loading) return <Skeleton className="h-64" />
  if (!orders.length) return <EmptyState icon={Package} title="Nessun ordine negli ultimi 7 giorni" />
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <div className="border-b px-4 py-3 text-sm text-muted-foreground">Ritirati: {formatMoney(total)}</div>
      <ul className="divide-y">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center gap-4 px-4 py-3 text-sm">
            <span className="w-12 font-semibold tabular">#{o.pickup_number}</span>
            <span className="min-w-0 flex-1 truncate">{o.customer_first_name ?? '—'} · {o.order_items.length} voci</span>
            <span className="hidden text-muted-foreground sm:block">{formatDateTime(o.created_at)}</span>
            <Badge tone={o.status === 'cancelled' ? 'danger' : 'neutral'}>{o.status === 'cancelled' ? 'Annullato' : 'Ritirato'}</Badge>
            <span className="w-20 text-right font-medium tabular">{formatMoney(o.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
