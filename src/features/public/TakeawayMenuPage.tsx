import { useMutation, useQuery } from '@tanstack/react-query'
import { Minus, Package, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AddDishDialog } from '@/features/menu-view/AddDishDialog'
import { MenuBrowser } from '@/features/menu-view/MenuBrowser'
import type { CartLine, MenuDish } from '@/features/menu-view/types'
import { PublicLayout, PublicMessage } from '@/features/customer/PublicLayout'
import { usePublicMenu, type PublicRestaurant } from '@/features/customer/useTableSession'
import { callFunction, rpc } from '@/shared/lib/api'
import { formatMoney } from '@/shared/lib/format'
import { ensureSession } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Callout, Spinner } from '@/shared/ui/display'
import { Field, Input, Textarea } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'

export function usePublicRestaurant(id: string) {
  return useQuery({ queryKey: ['public-restaurant', id], queryFn: async () => (await rpc('get_public_restaurant', { p_restaurant_id: id })) as unknown as PublicRestaurant | null })
}

function useLocalCart(key: string) {
  const [lines, setLines] = useState<CartLine[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(lines)) } catch { /* ignora */ } }, [key, lines])
  return [lines, setLines] as const
}

export function TakeawayMenuPage() {
  const { restaurantId = '' } = useParams()
  const navigate = useNavigate()
  const info = usePublicRestaurant(restaurantId)
  const menu = usePublicMenu(restaurantId, 'takeaway')
  const [lines, setLines] = useLocalCart(`minthi-takeaway-${restaurantId}`)
  const [picked, setPicked] = useState<MenuDish | null>(null)
  const [checkout, setCheckout] = useState(false)
  const dishes = useMemo(() => new Map((menu.data?.dishes ?? []).map((d) => [d.id, d])), [menu.data])
  const valid = lines.filter((l) => dishes.has(l.dishId))
  const total = valid.reduce((s, l) => s + dishes.get(l.dishId)!.price * l.quantity, 0)
  const count = valid.reduce((s, l) => s + l.quantity, 0)

  if (info.isLoading) return <Spinner className="min-h-dvh" />
  const r = info.data
  if (!r) return <PublicMessage title="Locale non trovato" />
  if (!r.isActive || !r.takeaway.enabled) {
    return <PublicLayout accent={r.theme?.accent} name={r.name} logoUrl={r.logoUrl}><PublicMessage icon={<Package className="size-6 text-muted-foreground" />} title="Asporto non disponibile">Al momento {r.name} non accetta ordini online.</PublicMessage></PublicLayout>
  }

  return (
    <PublicLayout accent={r.theme?.accent} name={r.name} logoUrl={r.logoUrl} subtitle={`Asporto · pronto in circa ${r.takeaway.estimatedMinutes} min`}>
      <main className="mx-auto max-w-3xl px-4 pb-32">
        {r.takeaway.pickupNotice && <Callout className="mt-3">{r.takeaway.pickupNotice}</Callout>}
        {menu.data ? <MenuBrowser categories={menu.data.categories} dishes={menu.data.dishes} onSelect={setPicked} stickyTop="top-14"
          quantities={valid.reduce<Record<string, number>>((a, l) => ({ ...a, [l.dishId]: (a[l.dishId] ?? 0) + l.quantity }), {})} /> : <Spinner />}
      </main>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-surface/95 p-3 backdrop-blur pb-safe">
          <Button size="lg" className="mx-auto flex w-full max-w-3xl justify-between" onClick={() => setCheckout(true)}>
            <span className="flex items-center gap-2"><ShoppingBag />Ordina · {count}</span><span className="tabular">{formatMoney(total)}</span>
          </Button>
        </div>
      )}
      <AddDishDialog dish={picked} onClose={() => setPicked(null)} onAdd={({ quantity, notes }) => setLines((ls) => [...ls, { key: crypto.randomUUID(), dishId: picked!.id, quantity, notes, course: 1 }])} />
      <CheckoutDialog open={checkout} onClose={() => setCheckout(false)} restaurant={r} lines={valid} setLines={setLines} dishes={dishes} total={total}
        onPlaced={(token) => { setLines([]); navigate(`/asporto/ordine/${token}`) }} />
    </PublicLayout>
  )
}

function CheckoutDialog({ open, onClose, restaurant: r, lines, setLines, dishes, total, onPlaced }: {
  open: boolean; onClose: () => void; restaurant: PublicRestaurant; lines: CartLine[]; setLines: React.Dispatch<React.SetStateAction<CartLine[]>>
  dishes: Map<string, MenuDish>; total: number; onPlaced: (token: string) => void
}) {
  const fields = r.takeaway.fields
  const [c, setC] = useState(() => { try { return JSON.parse(localStorage.getItem('minthi-customer') ?? '{}') } catch { return {} } } )
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value })
  const place = useMutation({
    mutationFn: async (payOnline: boolean) => {
      await ensureSession()
      try { localStorage.setItem('minthi-customer', JSON.stringify({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email })) } catch { /* ignora */ }
      const res = (await rpc('place_takeaway_order', { p_restaurant_id: r.id, p_items: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, notes: l.notes })), p_customer: c })) as { token: string }
      if (payOnline) {
        const { url } = await callFunction<{ url: string }>('checkout', { kind: 'takeaway', token: res.token })
        window.location.href = url
        return null
      }
      return res.token
    },
    onSuccess: (token) => { if (token) onPlaced(token) },
  })
  const row = (k: 'firstName' | 'lastName' | 'phone' | 'email', key: string, label: string, type = 'text', auto?: string) => fields[k] !== 'off' && (
    <Field label={label} optional={fields[k] === 'optional'}><Input type={type} autoComplete={auto} required={fields[k] === 'required'} value={c[key] ?? ''} onChange={set(key)} /></Field>
  )
  const mustPayOnline = r.takeaway.requireOnlinePayment

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Il tuo ordine">
        <form onSubmit={(e) => { e.preventDefault(); place.mutate(mustPayOnline) }} className="grid gap-4">
          <ul className="divide-y rounded-xl border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{dishes.get(l.dishId)?.name}</p>{l.notes && <p className="truncate text-xs text-muted-foreground">{l.notes}</p>}</div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Meno" onClick={() => setLines((ls) => ls.flatMap((x) => x.key !== l.key ? [x] : x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []))}>{l.quantity > 1 ? <Minus /> : <Trash2 />}</Button>
                <span className="w-5 text-center text-sm font-semibold tabular">{l.quantity}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Più" onClick={() => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x))}><Plus /></Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            {row('firstName', 'first_name', 'Nome', 'text', 'given-name')}
            {row('lastName', 'last_name', 'Cognome', 'text', 'family-name')}
            {row('phone', 'phone', 'Telefono', 'tel', 'tel')}
            {row('email', 'email', 'Email', 'email', 'email')}
          </div>
          <Field label="Note per la cucina" optional><Textarea value={c.notes ?? ''} onChange={set('notes')} maxLength={500} className="min-h-16" /></Field>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-lg font-semibold tabular">{formatMoney(total)}</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!mustPayOnline && <Button type="submit" variant={r.onlinePayments ? 'outline' : 'primary'} size="lg" loading={place.isPending && !place.variables}>Paga al ritiro</Button>}
              {r.onlinePayments && <Button type="button" size="lg" loading={place.isPending && !!place.variables} onClick={(e) => { const f = (e.currentTarget.closest('form') as HTMLFormElement); if (f.reportValidity()) place.mutate(true) }}>Paga ora con carta</Button>}
            </div>
          </DialogFooter>
          {mustPayOnline && !r.onlinePayments && <p className="text-sm text-danger">Pagamento online non disponibile al momento.</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
