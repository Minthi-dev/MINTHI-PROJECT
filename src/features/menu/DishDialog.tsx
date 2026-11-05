import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/shared/lib/errors'
import { ALLERGENS, VAT_CODES } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Select, SwitchRow } from '@/shared/ui/controls'
import { AffixInput, Field, Input, Textarea } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'
import { uploadImage, useSaveDish, type Category, type Dish } from './queries'

const empty = { name: '', description: '', price: '', category_id: '', vat_rate_code: '10', allergens: [] as string[], short_code: '', image_url: null as string | null, included_in_ayce: false, ayce_max_per_person: '', takeaway_available: true }

export function DishDialog({ open, dish, categories, defaultCategory, onClose, ayceEnabled }: { open: boolean; dish: Dish | null; categories: Category[]; defaultCategory?: string; onClose: () => void; ayceEnabled: boolean }) {
  const r = useRestaurant()
  const save = useSaveDish()
  const [f, setF] = useState(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setF(dish ? {
      name: dish.name, description: dish.description ?? '', price: String(dish.price).replace('.', ','), category_id: dish.category_id ?? '',
      vat_rate_code: dish.vat_rate_code, allergens: dish.allergens, short_code: dish.short_code ?? '', image_url: dish.image_url,
      included_in_ayce: dish.included_in_ayce, ayce_max_per_person: dish.ayce_max_per_person ? String(dish.ayce_max_per_person) : '', takeaway_available: dish.takeaway_available,
    } : { ...empty, category_id: defaultCategory ?? categories[0]?.id ?? '' })
  }, [open, dish, categories, defaultCategory])

  const onFile = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      setF((x) => ({ ...x, image_url: null }))
      const url = await uploadImage('dishes', r.id, file)
      setF((x) => ({ ...x, image_url: url }))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = Number(f.price.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) return toast.error('Prezzo non valido')
    await save.mutateAsync({
      id: dish?.id, name: f.name.trim(), description: f.description.trim() || null, price,
      category_id: f.category_id || null, vat_rate_code: f.vat_rate_code, allergens: f.allergens,
      short_code: f.short_code.trim() || null, image_url: f.image_url, included_in_ayce: f.included_in_ayce,
      ayce_max_per_person: f.included_in_ayce && f.ayce_max_per_person ? Number(f.ayce_max_per_person) : null,
      takeaway_available: f.takeaway_available,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={dish ? 'Modifica piatto' : 'Nuovo piatto'} size="lg">
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted text-muted-foreground hover:bg-muted/70">
                {f.image_url ? <img src={f.image_url} alt="" className="size-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="size-6" />{uploading ? 'Caricamento…' : 'Aggiungi foto'}</span>}
              </button>
              {f.image_url && <Button type="button" variant="danger-ghost" size="sm" className="mt-1 w-full" onClick={() => setF({ ...f, image_url: null })}><Trash2 />Rimuovi</Button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <div className="grid gap-4">
              <Field label="Nome" htmlFor="dn"><Input id="dn" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prezzo" htmlFor="dp"><AffixInput id="dp" prefix="€" required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="0,00" /></Field>
                <Field label="Codice" htmlFor="dc" optional hint="Per ordinare veloce"><Input id="dc" maxLength={12} value={f.short_code} onChange={(e) => setF({ ...f, short_code: e.target.value })} /></Field>
              </div>
              <Field label="Categoria"><Select value={f.category_id || undefined} onValueChange={(v) => setF({ ...f, category_id: v })} placeholder="Scegli" options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
            </div>
          </div>
          <Field label="Descrizione" optional><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></Field>
          <Field label="Allergeni">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ALLERGENS).map(([k, label]) => {
                const on = f.allergens.includes(k)
                return (
                  <button type="button" key={k} onClick={() => setF({ ...f, allergens: on ? f.allergens.filter((a) => a !== k) : [...f.allergens, k] })}
                    className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-primary bg-accent text-accent-foreground' : 'bg-surface hover:bg-muted')}>
                    {label}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="IVA" hint="Usata per gli scontrini elettronici."><Select value={f.vat_rate_code} onValueChange={(v) => setF({ ...f, vat_rate_code: v })} options={VAT_CODES} /></Field>
          <div className="divide-y rounded-xl border px-4">
            <SwitchRow title="Disponibile per l'asporto" checked={f.takeaway_available} onCheckedChange={(v) => setF({ ...f, takeaway_available: v })} />
            {ayceEnabled && <SwitchRow title="Incluso nell'All You Can Eat" description="Prezzo 0 per i tavoli in formula AYCE." checked={f.included_in_ayce} onCheckedChange={(v) => setF({ ...f, included_in_ayce: v })} />}
            {ayceEnabled && f.included_in_ayce && (
              <div className="py-3"><Field label="Massimo a persona" optional hint="Vuoto = senza limite"><Input inputMode="numeric" value={f.ayce_max_per_person} onChange={(e) => setF({ ...f, ayce_max_per_person: e.target.value.replace(/\D/g, '') })} className="w-28" /></Field></div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" loading={save.isPending} disabled={uploading}>Salva piatto</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
