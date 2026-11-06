import { useEffect, useState } from 'react'
import { ALLERGENS, formatMoney } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented, Stepper } from '@/shared/ui/controls'
import { Badge } from '@/shared/ui/display'
import { Field, Textarea } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'
import type { MenuDish } from './types'

export function AddDishDialog({ dish, onClose, onAdd, courses, ayce, limitNote }: {
  dish: MenuDish | null
  onClose: () => void
  onAdd: (v: { quantity: number; notes: string; course: number }) => void | Promise<void>
  courses?: boolean
  ayce?: boolean
  limitNote?: string
}) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [course, setCourse] = useState('1')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (dish) {
      setQuantity(1)
      setNotes('')
    }
  }, [dish])

  const included = ayce && dish?.includedInAyce
  const submit = async () => {
    setBusy(true)
    try {
      await onAdd({ quantity, notes: notes.trim(), course: Number(course) })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!dish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={dish?.name ?? ''} description={included ? 'Incluso nell\'All You Can Eat' : dish ? formatMoney(dish.price) : ''} size="sm">
        {dish?.imageUrl && <img src={dish.imageUrl} alt="" className="-mx-5 -mt-4 mb-4 aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none object-cover" />}
        <div className="grid gap-4">
          {dish?.description && <p className="text-sm text-muted-foreground">{dish.description}</p>}
          {!!dish?.allergens.length && (
            <div className="flex flex-wrap gap-1">{dish.allergens.map((a) => <Badge key={a}>{ALLERGENS[a] ?? a}</Badge>)}</div>
          )}
          {limitNote && <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">{limitNote}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quantità</span>
            <Stepper value={quantity} onChange={setQuantity} min={1} max={30} />
          </div>
          {courses && (
            <Field label="Portata">
              <Segmented value={course} onChange={setCourse} className="w-full" options={[{ value: '1', label: '1ª' }, { value: '2', label: '2ª' }, { value: '3', label: '3ª' }, { value: '4', label: '4ª' }]} />
            </Field>
          )}
          <Field label="Note" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Senza cipolla, ben cotto…" className="min-h-16" />
          </Field>
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full" onClick={submit} loading={busy}>
            Aggiungi {included ? '' : `· ${formatMoney((dish?.price ?? 0) * quantity)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
