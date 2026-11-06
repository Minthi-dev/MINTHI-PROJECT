import { useMutation } from '@tanstack/react-query'
import { BellRing, BookOpen, CheckCircle2, Clock, Receipt, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AddDishDialog } from '@/features/menu-view/AddDishDialog'
import { MenuBrowser } from '@/features/menu-view/MenuBrowser'
import type { MenuDish } from '@/features/menu-view/types'
import { rpc, unwrap } from '@/shared/lib/api'
import { cn } from '@/shared/lib/cn'
import { formatMoney } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/display'
import { BillView } from './BillView'
import { CartDialog } from './CartDialog'
import { GuestOrders } from './GuestOrders'
import { PinGate } from './PinGate'
import { PublicLayout, PublicMessage } from './PublicLayout'
import { usePublicMenu, useMySession, useSessionLive, useTableEntry } from './useTableSession'

type Tab = 'menu' | 'orders' | 'bill'

export function TablePage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const entry = useTableEntry(token)
  const e = entry.data
  const session = useMySession(e?.tableId)
  const menu = usePublicMenu(e?.restaurantId)
  const s = session.data
  const open = s?.status === 'open'
  const live = useSessionLive(open ? s!.id : undefined, e?.tableId)
  const [tab, setTab] = useState<Tab>(params.get('pagamento') ? 'bill' : 'menu')
  const [picked, setPicked] = useState<MenuDish | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [wantsNewSession, setWantsNewSession] = useState(false)

  const assist = useMutation({
    mutationFn: () => rpc('set_assistance', { p_session_id: s!.id, p_requested: true }),
    onSuccess: () => toast.success('Abbiamo avvisato il personale'),
  })

  if (entry.isLoading || (e && session.isLoading)) return <Spinner className="min-h-dvh" />
  if (!e) return <PublicMessage icon={<UtensilsCrossed className="size-6 text-muted-foreground" />} title="QR non valido">Questo codice non corrisponde a nessun tavolo attivo.</PublicMessage>

  const r = e.restaurant
  const viewOnly = r.viewOnlyMenu || !r.dineInEnabled
  const accent = r.theme?.accent

  // solo menu (niente ordini dal telefono)
  if (viewOnly) {
    return (
      <PublicLayout accent={accent} name={r.name} logoUrl={r.logoUrl} subtitle={`Tavolo ${e.tableName} · Menu`}>
        <main className="mx-auto max-w-3xl px-4 pb-16">
          {menu.data ? <MenuBrowser categories={menu.data.categories} dishes={menu.data.dishes} onSelect={setPicked} readOnly stickyTop="top-14" /> : <Spinner />}
          <p className="mt-10 text-center text-sm text-muted-foreground">Per ordinare chiama il personale di sala.</p>
        </main>
        <AddDishDialog dish={picked} onClose={() => setPicked(null)} onAdd={() => setPicked(null)} />
      </PublicLayout>
    )
  }

  if (!s || wantsNewSession) {
    if (!e.hasOpenSession) {
      return (
        <PublicLayout accent={accent} name={r.name} logoUrl={r.logoUrl}>
          <PublicMessage icon={<Clock className="size-6 text-muted-foreground" />} title={`Tavolo ${e.tableName} non ancora aperto`}>
            Chiedi al personale di aprire il tavolo e di darti il PIN.
            <Button variant="outline" className="mt-6" onClick={() => entry.refetch()}>Riprova</Button>
          </PublicMessage>
        </PublicLayout>
      )
    }
    return (
      <PublicLayout accent={accent} name={r.name} logoUrl={r.logoUrl}>
        <PinGate token={token} tableName={e.tableName} onJoined={() => { setWantsNewSession(false); session.refetch() }} />
      </PublicLayout>
    )
  }

  if (s.status === 'closed') {
    return (
      <PublicLayout accent={accent} name={r.name} logoUrl={r.logoUrl}>
        <PublicMessage icon={<CheckCircle2 className="size-6 text-success" />} title="Grazie della visita!">
          Il tavolo è stato chiuso. Ti aspettiamo presto da {r.name}.
          <Button variant="ghost" className="mt-6" onClick={async () => { await entry.refetch(); setWantsNewSession(true) }}>Sei a un nuovo tavolo? Inserisci il PIN</Button>
        </PublicMessage>
      </PublicLayout>
    )
  }

  const cart = live.cart.data ?? []
  const dishes = new Map((menu.data?.dishes ?? []).map((d) => [d.id, d]))
  const cartCount = cart.reduce((n, c) => n + c.quantity, 0)
  const cartTotal = cart.reduce((sum, c) => sum + ((s.ayce && dishes.get(c.dish_id)?.includedInAyce) ? 0 : (dishes.get(c.dish_id)?.price ?? 0)) * c.quantity, 0)
  const quantities = cart.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.dish_id]: (acc[c.dish_id] ?? 0) + c.quantity }), {})
  const roundsUsed = live.orders.data?.orders.length ?? 0

  const addToCart = async ({ quantity, notes, course }: { quantity: number; notes: string; course: number }) => {
    unwrap(await supabase.from('cart_items').insert({ session_id: s.id, dish_id: picked!.id, quantity, notes: notes || null, course }).select('id'))
    live.invalidate()
    toast.success(`${picked!.name} nel carrello`)
  }

  return (
    <PublicLayout accent={accent} name={r.name} logoUrl={r.logoUrl} subtitle={`Tavolo ${e.tableName}${s.ayce ? ' · All You Can Eat' : ''}`}
      actions={<Button variant="outline" size="sm" onClick={() => assist.mutate()} loading={assist.isPending}><BellRing />Cameriere</Button>}>
      <main className="mx-auto max-w-3xl px-4 pb-40">
        {s.ayce && tab === 'menu' && (
          <div className="mt-3 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            <strong>All You Can Eat</strong> · i piatti segnati “incluso” non si pagano.
            {s.ayce_max_rounds > 0 && <> Ordini: {roundsUsed}/{s.ayce_max_rounds}.</>}
          </div>
        )}
        {tab === 'menu' && (menu.data
          ? <MenuBrowser categories={menu.data.categories} dishes={menu.data.dishes} onSelect={setPicked} ayce={s.ayce} quantities={quantities} stickyTop="top-14" />
          : <Spinner />)}
        {tab === 'orders' && <GuestOrders data={live.orders.data} />}
        {tab === 'bill' && <BillView sessionId={s.id} token={token} onlinePayments={r.onlinePayments} paymentResult={params.get('pagamento')} />}
      </main>

      {tab === 'menu' && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-20 px-4 pb-safe">
          <Button size="lg" className="mx-auto flex w-full max-w-3xl justify-between shadow-lg" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2"><ShoppingBag />Carrello · {cartCount}</span>
            <span className="tabular">{formatMoney(cartTotal)}</span>
          </Button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-surface/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-3xl">
          {([['menu', 'Menu', BookOpen], ['orders', 'I miei ordini', UtensilsCrossed], ['bill', 'Conto', Receipt]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setTab(v)} className={cn('flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium', tab === v ? 'text-primary' : 'text-muted-foreground')}>
              <Icon className="size-5" />{label}
            </button>
          ))}
        </div>
      </nav>

      <AddDishDialog dish={picked} onClose={() => setPicked(null)} onAdd={addToCart} courses={r.coursesEnabled} ayce={s.ayce}
        limitNote={picked && s.ayce && picked.includedInAyce && picked.ayceMaxPerPerson ? `Massimo ${picked.ayceMaxPerPerson * s.guests} per il tavolo nella formula.` : undefined} />
      <CartDialog open={cartOpen} onClose={() => setCartOpen(false)} sessionId={s.id} cart={cart} dishes={dishes} ayce={s.ayce} courses={r.coursesEnabled}
        onSent={() => { setCartOpen(false); setTab('orders') }} />
    </PublicLayout>
  )
}
