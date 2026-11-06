import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MenuDish } from '@/features/menu-view/types'
import { rpc, unwrap } from '@/shared/lib/api'
import { formatMoney } from '@/shared/lib/format'
import { supabase, type Tables } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'

export function CartDialog({ open, onClose, sessionId, cart, dishes, ayce, courses, onSent }: {
  open: boolean; onClose: () => void; sessionId: string; cart: Tables<'cart_items'>[]; dishes: Map<string, MenuDish>; ayce: boolean; courses: boolean; onSent: () => void
}) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['cart', sessionId] })
  const setQty = useMutation({
    mutationFn: async (a: { id: string; quantity: number }) => a.quantity <= 0
      ? unwrap(await supabase.from('cart_items').delete().eq('id', a.id).select('id'))
      : unwrap(await supabase.from('cart_items').update({ quantity: a.quantity }).eq('id', a.id).select('id')),
    onSuccess: refresh,
  })
  const send = useMutation({
    mutationFn: () => rpc('submit_order', { p_session_id: sessionId }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['guest-orders', sessionId] }); toast.success('Ordine inviato in cucina!'); onSent() },
  })
  const price = (c: Tables<'cart_items'>) => ((ayce && dishes.get(c.dish_id)?.includedInAyce) ? 0 : (dishes.get(c.dish_id)?.price ?? 0)) * c.quantity
  const total = cart.reduce((s, c) => s + price(c), 0)
  const byCourse = courses ? [...new Set(cart.map((c) => c.course))].sort() : [1]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Il carrello del tavolo" description="È condiviso: vedi anche quello che aggiungono gli altri al tavolo.">
        {cart.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Il carrello è vuoto.</p> : (
          <div className="grid gap-4">
            {byCourse.map((course) => (
              <div key={course}>
                {courses && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portata {course}</p>}
                <ul className="divide-y rounded-xl border">
                  {cart.filter((c) => !courses || c.course === course).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{dishes.get(c.dish_id)?.name ?? 'Piatto'}</p>
                        {c.notes && <p className="truncate text-xs text-muted-foreground">“{c.notes}”</p>}
                        <p className="text-sm tabular text-muted-foreground">{price(c) === 0 ? 'incluso' : formatMoney(price(c))}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-sm" aria-label="Meno" onClick={() => setQty.mutate({ id: c.id, quantity: c.quantity - 1 })}>{c.quantity > 1 ? <Minus /> : <Trash2 />}</Button>
                        <span className="w-6 text-center font-semibold tabular">{c.quantity}</span>
                        <Button variant="outline" size="icon-sm" aria-label="Più" onClick={() => setQty.mutate({ id: c.id, quantity: c.quantity + 1 })}><Plus /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-center text-lg font-semibold tabular sm:text-left">{formatMoney(total)}</span>
          <Button size="lg" disabled={!cart.length} loading={send.isPending} onClick={() => send.mutate()}><Send />Invia ordine</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
