import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Minus, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { AddDishDialog } from '@/features/menu-view/AddDishDialog'
import { MenuBrowser } from '@/features/menu-view/MenuBrowser'
import type { CartLine, MenuDish } from '@/features/menu-view/types'
import { useSettings } from '@/features/settings/queries'
import { rpc, unwrap } from '@/shared/lib/api'
import { formatMoney } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Card, Spinner } from '@/shared/ui/display'

export function useStaffMenu() {
  const r = useRestaurant()
  return useQuery({
    queryKey: ['r', r.id, 'menu', 'staff-view'],
    queryFn: async () => {
      const [cats, dishes] = await Promise.all([
        supabase.from('categories').select('id, name').eq('restaurant_id', r.id).eq('is_active', true).order('sort_order'),
        supabase.from('dishes').select('*').eq('restaurant_id', r.id).eq('is_active', true).order('sort_order').order('name'),
      ])
      return {
        categories: unwrap(cats),
        dishes: unwrap(dishes).map<MenuDish>((d) => ({
          id: d.id, categoryId: d.category_id, name: d.name, description: d.description, price: Number(d.price),
          allergens: d.allergens, imageUrl: d.image_url, isAvailable: d.is_available, includedInAyce: d.included_in_ayce,
          ayceMaxPerPerson: d.ayce_max_per_person, shortCode: d.short_code,
        })),
      }
    },
  })
}

export function OrderComposerPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const menu = useStaffMenu()
  const settings = useSettings()
  const session = useQuery({
    queryKey: ['session-head', sessionId],
    queryFn: async () => unwrap(await supabase.from('table_sessions').select('id, ayce, guests, status, tables(name)').eq('id', sessionId).single()),
  })
  const [lines, setLines] = useState<CartLine[]>([])
  const [picked, setPicked] = useState<MenuDish | null>(null)

  const dishes = useMemo(() => new Map((menu.data?.dishes ?? []).map((d) => [d.id, d])), [menu.data])
  const quantities = useMemo(() => lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.dishId]: (acc[l.dishId] ?? 0) + l.quantity }), {}), [lines])
  const ayce = session.data?.ayce ?? false
  const total = lines.reduce((s, l) => s + ((ayce && dishes.get(l.dishId)?.includedInAyce) ? 0 : (dishes.get(l.dishId)?.price ?? 0)) * l.quantity, 0)

  const submit = useMutation({
    mutationFn: () => rpc('submit_order', { p_session_id: sessionId, p_items: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, notes: l.notes, course: l.course })) }),
    onSuccess: () => {
      toast.success('Ordine inviato in cucina')
      navigate('/app/sala')
    },
  })

  if (menu.isLoading || session.isLoading) return <Spinner />
  const tableName = (session.data as { tables?: { name?: string } } | undefined)?.tables?.name

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Indietro"><ArrowLeft /></Button>
          <div>
            <h1 className="text-xl font-semibold">Ordine · Tavolo {tableName}</h1>
            <p className="text-sm text-muted-foreground">Tocca un piatto per aggiungerlo{ayce ? ' · All You Can Eat attivo' : ''}</p>
          </div>
        </div>
        <MenuBrowser
          categories={menu.data!.categories}
          dishes={menu.data!.dishes}
          onSelect={setPicked}
          quantities={quantities}
          ayce={ayce}
          compact
          stickyTop="top-14 lg:top-0"
        />
      </div>

      {/* riepilogo: colonna fissa su desktop, barra in basso su mobile */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Card className="fixed inset-x-0 bottom-16 z-20 mx-3 mb-safe rounded-2xl shadow-lg lg:static lg:m-0 lg:shadow-sm">
          <div className="max-h-[40vh] overflow-y-auto lg:max-h-[60vh]">
            {lines.length === 0 ? (
              <p className="px-4 py-4 text-center text-sm text-muted-foreground">Nessun piatto aggiunto</p>
            ) : (
              <ul className="divide-y">
                {lines.map((l) => {
                  const d = dishes.get(l.dishId)
                  return (
                    <li key={l.key} className="flex items-center gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d?.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[l.course > 1 && `Portata ${l.course}`, l.notes].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Meno" onClick={() => setLines((ls) => ls.flatMap((x) => x.key !== l.key ? [x] : x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []))}>
                          {l.quantity > 1 ? <Minus /> : <Trash2 />}
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold tabular">{l.quantity}</span>
                        <Button variant="ghost" size="icon-sm" aria-label="Più" onClick={() => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x))}><Plus /></Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-3 border-t p-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{lines.reduce((s, l) => s + l.quantity, 0)} piatti</p>
              <p className="font-semibold tabular">{formatMoney(total)}</p>
            </div>
            <Button size="lg" disabled={!lines.length} loading={submit.isPending} onClick={() => submit.mutate()}><Send />Invia</Button>
          </div>
        </Card>
      </aside>

      <AddDishDialog
        dish={picked}
        onClose={() => setPicked(null)}
        courses={settings.data?.courses_enabled}
        ayce={ayce}
        onAdd={({ quantity, notes, course }) => {
          setLines((ls) => {
            const same = ls.find((l) => l.dishId === picked!.id && l.notes === notes && l.course === course)
            if (same) return ls.map((l) => l === same ? { ...l, quantity: l.quantity + quantity } : l)
            return [...ls, { key: crypto.randomUUID(), dishId: picked!.id, quantity, notes, course }]
          })
        }}
      />
    </div>
  )
}
