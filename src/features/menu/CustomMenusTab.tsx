import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings, useUpdateSettings } from '@/features/settings/queries'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Checkbox, Select } from '@/shared/ui/controls'
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, useConfirm } from '@/shared/ui/overlay'
import { useDeleteCustomMenu, useSaveCustomMenu, type Category, type CustomMenu, type Dish } from './queries'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function CustomMenusTab({ data }: { data: { categories: Category[]; dishes: Dish[]; menus: CustomMenu[] } }) {
  const settings = useSettings()
  const update = useUpdateSettings()
  const del = useDeleteCustomMenu()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<CustomMenu | 'new' | null>(null)
  const manual = settings.data?.active_custom_menu_id ?? 'auto'

  return (
    <div className="grid gap-5">
      <Callout title="Come funzionano" icon={CalendarClock}>
        Un menu speciale mostra ai clienti solo una selezione di piatti. Può attivarsi da solo in giorni e fasce scelte (es. "Pranzo di lavoro" lun-ven a pranzo) oppure lo attivi a mano qui sotto.
      </Callout>
      <Card>
        <CardHeader title="Menu attivo adesso" description="Scelta manuale: ha la precedenza sulla programmazione." />
        <CardBody>
          <Select value={manual} onValueChange={(v) => update.mutate({ active_custom_menu_id: v === 'auto' ? null : v })}
            options={[{ value: 'auto', label: 'Automatico (programmazione / menu completo)' }, ...data.menus.map((m) => ({ value: m.id, label: m.name }))]} />
        </CardBody>
      </Card>

      {data.menus.length === 0 ? (
        <EmptyState title="Nessun menu speciale" action={<Button onClick={() => setEditing('new')}><Plus />Crea menu</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.menus.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button className="text-left" onClick={() => setEditing(m)}>
                  <p className="font-semibold">{m.name} {manual === m.id && <Badge tone="brand" className="ml-1">attivo</Badge>}</p>
                  <p className="text-sm text-muted-foreground">{m.custom_menu_dishes.length} piatti · {m.custom_menu_schedules.length ? m.custom_menu_schedules.map((s) => `${DAYS[s.day_of_week]} ${s.period === 'lunch' ? 'pranzo' : 'cena'}`).join(', ') : 'nessuna programmazione'}</p>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label="Elimina" onClick={async () => { if (await confirm({ title: `Eliminare ${m.name}?`, danger: true, confirmLabel: 'Elimina' })) del.mutate(m.id) }}><Trash2 /></Button>
              </div>
            </Card>
          ))}
          <button onClick={() => setEditing('new')} className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-medium text-muted-foreground hover:bg-muted"><Plus className="size-4" />Nuovo menu speciale</button>
        </div>
      )}
      <CustomMenuDialog value={editing} data={data} onClose={() => setEditing(null)} />
    </div>
  )
}

function CustomMenuDialog({ value, data, onClose }: { value: CustomMenu | 'new' | null; data: { categories: Category[]; dishes: Dish[] }; onClose: () => void }) {
  const save = useSaveCustomMenu()
  const menu = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [dishIds, setDishIds] = useState<Set<string>>(new Set())
  const [slots, setSlots] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!value) return
    setName(menu?.name ?? '')
    setDishIds(new Set(menu?.custom_menu_dishes.map((d) => d.dish_id) ?? []))
    setSlots(new Set(menu?.custom_menu_schedules.map((s) => `${s.day_of_week}:${s.period}`) ?? []))
  }, [value, menu])

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={menu ? 'Modifica menu speciale' : 'Nuovo menu speciale'} size="lg">
        <div className="grid gap-5">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Pranzo di lavoro" /></Field>
          <Field label="Quando si attiva da solo" hint="Le fasce pranzo/cena sono quelle degli orari del locale.">
            <div className="grid grid-cols-8 gap-1 text-center text-xs">
              <span />
              {DAYS.map((d) => <span key={d} className="font-medium text-muted-foreground">{d}</span>)}
              {(['lunch', 'dinner'] as const).map((p) => (
                <div key={p} className="contents">
                  <span className="flex items-center text-muted-foreground">{p === 'lunch' ? 'Pranzo' : 'Cena'}</span>
                  {DAYS.map((_, d) => {
                    const k = `${d}:${p}`
                    return <button key={k} type="button" onClick={() => setSlots(toggle(slots, k))} className={cn('h-9 rounded-md border', slots.has(k) ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface hover:bg-muted')} aria-pressed={slots.has(k)} aria-label={`${DAYS[d]} ${p}`}>{slots.has(k) ? '✓' : ''}</button>
                  })}
                </div>
              ))}
            </div>
          </Field>
          <Field label={`Piatti inclusi (${dishIds.size})`}>
            <div className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {data.categories.map((c) => {
                const ds = data.dishes.filter((d) => d.category_id === c.id)
                if (!ds.length) return null
                const all = ds.every((d) => dishIds.has(d.id))
                return (
                  <div key={c.id} className="p-3">
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Checkbox checked={all} onCheckedChange={() => { const n = new Set(dishIds); ds.forEach((d) => (all ? n.delete(d.id) : n.add(d.id))); setDishIds(n) }} />{c.name}
                    </label>
                    <div className="grid gap-1.5 pl-7 sm:grid-cols-2">
                      {ds.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-sm"><Checkbox checked={dishIds.has(d.id)} onCheckedChange={() => setDishIds(toggle(dishIds, d.id))} />{d.name}</label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!name.trim()} loading={save.isPending} onClick={async () => {
            await save.mutateAsync({ id: menu?.id, name: name.trim(), dishIds: [...dishIds], schedules: [...slots].map((s) => { const [d, p] = s.split(':'); return { day_of_week: Number(d), period: p as 'lunch' | 'dinner' } }) })
            onClose()
          }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
