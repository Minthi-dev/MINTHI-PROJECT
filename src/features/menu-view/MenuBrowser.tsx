import { ImageOff, Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { ALLERGENS, formatMoney } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/display'
import { Input } from '@/shared/ui/input'
import type { MenuCategory, MenuDish } from './types'

interface Props {
  categories: MenuCategory[]
  dishes: MenuDish[]
  onSelect: (dish: MenuDish) => void
  ayce?: boolean
  quantities?: Record<string, number>
  compact?: boolean          // vista staff: righe dense, senza foto grandi
  readOnly?: boolean
  stickyTop?: string
}

/** Elenco del menu con categorie, ricerca (anche per codice breve) e aggiunta rapida. */
export function MenuBrowser({ categories, dishes, onSelect, ayce, quantities = {}, compact, readOnly, stickyTop = 'top-0' }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q
    ? dishes.filter((d) => d.name.toLowerCase().includes(q) || d.shortCode?.toLowerCase() === q || d.description?.toLowerCase().includes(q))
    : dishes), [dishes, q])

  const groups = useMemo(() => {
    const byCat = categories.map((c) => ({ category: c, dishes: filtered.filter((d) => d.categoryId === c.id) }))
    const orphans = filtered.filter((d) => !d.categoryId || !categories.some((c) => c.id === d.categoryId))
    if (orphans.length) byCat.push({ category: { id: '_other', name: 'Altro' }, dishes: orphans })
    return byCat.filter((g) => g.dishes.length)
  }, [categories, filtered])

  const jump = (id: string) => {
    setActive(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div className={cn('sticky z-10 -mx-4 bg-background/95 px-4 pb-3 pt-2 backdrop-blur', stickyTop)}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={compact ? 'Cerca piatto o codice…' : 'Cerca nel menu'} className="pl-9" type="search" />
        </div>
        {!q && groups.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
            {groups.map((g) => (
              <button key={g.category.id} onClick={() => jump(g.category.id)}
                className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active === g.category.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface hover:bg-muted')}>
                {g.category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nessun piatto trovato.</p>}

      <div className="grid gap-8">
        {groups.map((g) => (
          <section key={g.category.id} ref={(el) => { sectionRefs.current[g.category.id] = el }} className="scroll-mt-32">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{g.category.name}</h2>
            <div className={cn('grid gap-2', !compact && 'sm:grid-cols-2')}>
              {g.dishes.map((d) => (
                <DishRow key={d.id} dish={d} ayce={ayce} quantity={quantities[d.id] ?? 0} compact={compact} readOnly={readOnly} onSelect={() => onSelect(d)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function DishRow({ dish, ayce, quantity, compact, readOnly, onSelect }: { dish: MenuDish; ayce?: boolean; quantity: number; compact?: boolean; readOnly?: boolean; onSelect: () => void }) {
  const included = ayce && dish.includedInAyce
  const disabled = !dish.isAvailable
  return (
    <button
      onClick={onSelect}
      disabled={disabled && !compact}
      className={cn(
        'group relative flex w-full gap-3 rounded-xl border bg-surface p-3 text-left transition-shadow hover:shadow-md disabled:cursor-not-allowed',
        disabled && 'opacity-55',
        quantity > 0 && 'border-primary/50 ring-1 ring-primary/30',
      )}
    >
      {!compact && (
        <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          {dish.imageUrl ? <img src={dish.imageUrl} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><ImageOff className="size-5 text-muted-foreground/50" /></div>}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">
            {compact && dish.shortCode && <span className="mr-1.5 rounded bg-muted px-1 text-xs font-semibold tabular text-muted-foreground">{dish.shortCode}</span>}
            {dish.name}
          </p>
          <span className="shrink-0 text-sm font-semibold tabular">{included ? <Badge tone="brand">incluso</Badge> : formatMoney(dish.price)}</span>
        </div>
        {!compact && dish.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{dish.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
          {disabled && <Badge tone="danger">Esaurito</Badge>}
          {!compact && dish.allergens.slice(0, 4).map((a) => <Badge key={a}>{ALLERGENS[a] ?? a}</Badge>)}
          {!compact && dish.allergens.length > 4 && <Badge>+{dish.allergens.length - 4}</Badge>}
        </div>
      </div>
      {!readOnly && !disabled && (
        <span className={cn('absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full text-xs font-bold shadow-md',
          quantity > 0 ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground border opacity-0 group-hover:opacity-100')}>
          {quantity > 0 ? quantity : <Plus className="size-4" />}
        </span>
      )}
    </button>
  )
}
