import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { Button } from '@/shared/ui/button'
import { Select, SwitchRow } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { useSettings, useUpdateSettings } from '../queries'
import { publicUrl } from '@/shared/lib/url'

export function ReservationsSection() {
  const r = useRestaurant()
  const s = useSettings()
  const update = useUpdateSettings()
  if (!s.data) return <Skeleton className="h-64" />
  const url = publicUrl(`/prenota/${r.id}`)
  return (
    <Card>
      <CardHeader title="Prenotazioni" />
      <CardBody className="grid gap-2">
        <div className="divide-y">
          <SwitchRow title="Gestione prenotazioni" description="Mostra la sezione Prenotazioni allo staff." checked={s.data.reservations_enabled} onCheckedChange={(v) => update.mutate({ reservations_enabled: v })} />
          <SwitchRow title="Prenotazioni online" description="I clienti prenotano da soli dal link pubblico." checked={s.data.reservations_public} onCheckedChange={(v) => update.mutate({ reservations_public: v })} />
          <SwitchRow title="Scelta della sala" description="Il cliente può indicare la sala preferita." checked={s.data.reservation_room_selection} onCheckedChange={(v) => update.mutate({ reservation_room_selection: v })} />
        </div>
        <Field label="Durata standard di una prenotazione" className="pt-3">
          <Select value={String(s.data.reservation_duration_min)} onValueChange={(v) => update.mutate({ reservation_duration_min: Number(v) })} className="w-40"
            options={[60, 90, 120, 150, 180].map((m) => ({ value: String(m), label: `${m / 60} ore` }))} />
        </Field>
        {s.data.reservations_public && (
          <Field label="Link da condividere (sito, Instagram, Google)" className="pt-3">
            <div className="flex gap-2"><Input readOnly value={url} /><Button variant="outline" size="icon" aria-label="Copia" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiato') }}><Copy /></Button></div>
          </Field>
        )}
      </CardBody>
    </Card>
  )
}
