import { ArrowDown, ArrowUp, BookOpen, Eye, EyeOff, ImageOff, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSettings } from '@/features/settings/queries'
import { cn } from '@/shared/lib/cn'
import { formatMoney } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Switch } from '@/shared/ui/controls'
import { Badge, EmptyState, PageHeader, Skeleton, Tabs } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useConfirm } from '@/shared/ui/overlay'
import { CustomMenusTab } from './CustomMenusTab'
import { DishDialog } from './DishDialog'
import { useDeleteCategory, useDeleteDish, useMenuAdmin, usePatchDish, useReorder, useSaveCategory, useSetAvailability, type Category, type Dish } from './queries'

export function MenuPage() {
  const [tab, setTab] = useState<'dishes' | 'menus'>('dishes')
  const menu = useMenuAdmin()
  const settings = useSettings()
  const [editingDish, setEditingDish] = useState<{ dish: Dish | null; category?: string } | null>(null)
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null)
  const ayceEnabled = !!settings.data?.ayce_default || JSON.stringify(settings.data?.weekly_schedule ?? '').includes('ayce":{')

  return (
    <>
      <PageHeader
        title="Menu"
        description="Piatti, categorie e menu speciali. Le modifiche sono subito visibili ai clienti."
        actions={tab === 'dishes' && <>
          <Button variant="outline" onClick={() => setEditingCat('new')}><Plus />Categoria</Button>
          <Button onClick={() => setEditingDish({ dish: null })} disabled={!menu.data?.categories.length}><Plus />Piatto</Button>
        </>}
      />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[{ value: 'dishes', label: 'Piatti', count: menu.data?.dishes.length }, { value: 'menus', label: 'Menu speciali', count: menu.data?.menus.length }]} />

      {menu.isLoading ? <Skeleton className="h-96" /> : tab === 'menus' ? (
        <CustomMenusTab data={menu.data!} />
      ) : menu.data!.categories.length === 0 ? (
        <EmptyState icon={BookOpen} title="Crea la prima categoria" description="Es. Antipasti, Primi, Pizze, Bevande." action={<Button onClick={() => setEditingCat('new')}><Plus />Nuova categoria</Button>} />
      ) : (
        <div className="grid gap-6">
          {menu.data!.categories.map((c, idx) => (
            <CategorySection
              key={c.id}
              category={c}
              index={idx}
              categories={menu.data!.categories}
              dishes={menu.data!.dishes.filter((d) => d.category_id === c.id)}
              onEditDish={(d) => setEditingDish({ dish: d })}
              onAddDish={() => setEditingDish({ dish: null, category: c.id })}
              onEditCategory={() => setEditingCat(c)}
            />
          ))}
          {menu.data!.dishes.some((d) => !d.category_id) && (
            <CategorySection category={{ id: '', name: 'Senza categoria' } as Category} index={-1} categories={[]} dishes={menu.data!.dishes.filter((d) => !d.category_id)} onEditDish={(d) => setEditingDish({ dish: d })} />
          )}
        </div>
      )}

      <DishDialog open={!!editingDish} dish={editingDish?.dish ?? null} defaultCategory={editingDish?.category} categories={menu.data?.categories ?? []} onClose={() => setEditingDish(null)} ayceEnabled={ayceEnabled} />
      <CategoryDialog value={editingCat} onClose={() => setEditingCat(null)} />
    </>
  )
}

function CategorySection({ category, index, categories, dishes, onEditDish, onAddDish, onEditCategory }: {
  category: Category; index: number; categories: Category[]; dishes: Dish[]
  onEditDish: (d: Dish) => void; onAddDish?: () => void; onEditCategory?: () => void
}) {
  const reorderCats = useReorder('categories')
  const reorderDishes = useReorder('dishes')
  const saveCat = useSaveCategory()
  const delCat = useDeleteCategory()
  const confirm = useConfirm()
  const move = (dir: -1 | 1) => {
    const ids = categories.map((c) => c.id)
    const j = index + dir
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderCats.mutate(ids)
  }
  const moveDish = (i: number, dir: -1 | 1) => {
    const ids = dishes.map((d) => d.id)
    ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
    reorderDishes.mutate(ids)
  }

  return (
    <section className={cn('overflow-hidden rounded-xl border bg-surface', category.id && !category.is_active && 'opacity-60')}>
      <div className="flex items-center justify-between gap-3 border-b bg-surface-2/60 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">{category.name}<span className="text-sm font-normal text-muted-foreground">{dishes.length}</span>{category.id && !category.is_active && <Badge>nascosta</Badge>}</h2>
        {category.id && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onAddDish}><Plus />Piatto</Button>
            <Menu>
              <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni categoria"><MoreVertical /></Button></MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={onEditCategory}><Pencil />Rinomina</MenuItem>
                <MenuItem onSelect={() => saveCat.mutate({ id: category.id, name: category.name, is_active: !category.is_active })}>{category.is_active ? <><EyeOff />Nascondi ai clienti</> : <><Eye />Mostra ai clienti</>}</MenuItem>
                {index > 0 && <MenuItem onSelect={() => move(-1)}><ArrowUp />Sposta su</MenuItem>}
                {index < categories.length - 1 && <MenuItem onSelect={() => move(1)}><ArrowDown />Sposta giù</MenuItem>}
                <MenuSeparator />
                <MenuItem danger onSelect={async () => {
                  if (await confirm({ title: `Eliminare ${category.name}?`, description: 'I piatti resteranno senza categoria.', confirmLabel: 'Elimina', danger: true })) delCat.mutate(category.id)
                }}><Trash2 />Elimina</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
      </div>
      {dishes.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nessun piatto. <button className="font-medium text-primary" onClick={onAddDish}>Aggiungine uno</button></p>
      ) : (
        <ul className="divide-y">
          {dishes.map((d, i) => <DishRow key={d.id} dish={d} onEdit={() => onEditDish(d)} onUp={i > 0 ? () => moveDish(i, -1) : undefined} onDown={i < dishes.length - 1 ? () => moveDish(i, 1) : undefined} />)}
        </ul>
      )}
    </section>
  )
}

function DishRow({ dish, onEdit, onUp, onDown }: { dish: Dish; onEdit: () => void; onUp?: () => void; onDown?: () => void }) {
  const patch = usePatchDish()
  const avail = useSetAvailability()
  const del = useDeleteDish()
  const confirm = useConfirm()
  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', !dish.is_active && 'opacity-55')}>
      <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
        {dish.image_url ? <img src={dish.image_url} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center"><ImageOff className="size-4 text-muted-foreground/50" /></div>}
      </div>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium">{dish.short_code && <span className="mr-1.5 text-xs text-muted-foreground">{dish.short_code}</span>}{dish.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span className="tabular">{formatMoney(dish.price)}</span>
          {dish.included_in_ayce && <Badge tone="brand">AYCE</Badge>}
          {!dish.is_active && <Badge>nascosto</Badge>}
          {!dish.takeaway_available && <Badge>no asporto</Badge>}
        </p>
      </button>
      <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        {dish.is_available ? 'Disponibile' : 'Esaurito'}
        <Switch checked={dish.is_available} onCheckedChange={(v) => avail.mutate({ id: dish.id, available: v })} aria-label="Disponibile" />
      </label>
      <Menu>
        <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni piatto"><MoreVertical /></Button></MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onEdit}><Pencil />Modifica</MenuItem>
          <MenuItem className="sm:hidden" onSelect={() => avail.mutate({ id: dish.id, available: !dish.is_available })}>{dish.is_available ? 'Segna esaurito' : 'Segna disponibile'}</MenuItem>
          <MenuItem onSelect={() => patch.mutate({ id: dish.id, patch: { is_active: !dish.is_active } })}>{dish.is_active ? <><EyeOff />Nascondi</> : <><Eye />Mostra</>}</MenuItem>
          {onUp && <MenuItem onSelect={onUp}><ArrowUp />Sposta su</MenuItem>}
          {onDown && <MenuItem onSelect={onDown}><ArrowDown />Sposta giù</MenuItem>}
          <MenuSeparator />
          <MenuItem danger onSelect={async () => { if (await confirm({ title: `Eliminare ${dish.name}?`, description: 'Gli ordini passati restano nello storico.', confirmLabel: 'Elimina', danger: true })) del.mutate(dish.id) }}><Trash2 />Elimina</MenuItem>
        </MenuContent>
      </Menu>
    </li>
  )
}

function CategoryDialog({ value, onClose }: { value: Category | 'new' | null; onClose: () => void }) {
  const save = useSaveCategory()
  const [name, setName] = useState('')
  const editing = value && value !== 'new' ? value : null
  return (
    <Dialog open={!!value} onOpenChange={(o) => { if (!o) onClose(); else setName(editing?.name ?? '') }}>
      <DialogContent title={editing ? 'Rinomina categoria' : 'Nuova categoria'} size="sm" onOpenAutoFocus={() => setName(editing?.name ?? '')}>
        <form onSubmit={async (e) => { e.preventDefault(); await save.mutateAsync({ id: editing?.id, name: name.trim(), ...(editing ? {} : { sort_order: 999 }) }); onClose() }}>
          <Field label="Nome"><Input required autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Primi piatti" /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" loading={save.isPending}>Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
