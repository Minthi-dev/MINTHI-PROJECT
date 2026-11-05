import { Copy, ExternalLink, MonitorPlay } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { Button } from '@/shared/ui/button'
import { Segmented, SwitchRow } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input, Textarea } from '@/shared/ui/input'
import { useTakeawaySettings, useUpdateTakeawaySettings } from '../queries'

type Mode = 'off' | 'optional' | 'required'

export function TakeawaySection() {
  const r = useRestaurant()
  const s = useTakeawaySettings()
  const update = useUpdateTakeawaySettings()
  const [notice, setNotice] = useState('')
  const [qr, setQr] = useState('')
  const url = `${location.origin}/asporto/${r.id}`

  useEffect(() => { setNotice(s.data?.pickup_notice ?? '') }, [s.data?.pickup_notice])
  useEffect(() => { QRCode.toDataURL(url, { width: 480, margin: 1 }).then(setQr) }, [url])
  if (!s.data) return <Skeleton className="h-96" />
  const t = s.data

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Ordini da asporto" description="Menu online dove i clienti ordinano e ritirano al banco." />
        <CardBody className="divide-y py-0">
          <SwitchRow title="Asporto attivo" checked={t.enabled} onCheckedChange={(v) => update.mutate({ enabled: v })} />
          <SwitchRow title="Pagamento online obbligatorio" description="L'ordine arriva in cucina solo dopo il pagamento con carta (richiede Stripe attivo)." checked={t.require_online_payment} onCheckedChange={(v) => update.mutate({ require_online_payment: v })} />
          <SwitchRow title="Stampa automatica" description="Ogni nuovo ordine viene stampato sulla stampante di questo dispositivo." checked={t.auto_print} onCheckedChange={(v) => update.mutate({ auto_print: v })} />
        </CardBody>
      </Card>

      {t.enabled && (
        <Card>
          <CardHeader title="Link e QR per i clienti" />
          <CardBody className="grid gap-4 sm:grid-cols-[160px_1fr]">
            {qr ? <img src={qr} alt="QR menu asporto" className="w-40 rounded-xl border bg-white p-2" /> : <Skeleton className="size-40" />}
            <div className="grid content-start gap-3">
              <div className="flex gap-2"><Input readOnly value={url} onFocus={(e) => e.target.select()} /><Button variant="outline" size="icon" aria-label="Copia link" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiato') }}><Copy /></Button></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink />Apri menu</a></Button>
                <Button variant="outline" asChild><a href={`/display/${r.id}`} target="_blank" rel="noreferrer"><MonitorPlay />Schermo numeri</a></Button>
                {qr && <Button variant="outline" asChild><a href={qr} download="minthi-asporto-qr.png">Scarica QR</a></Button>}
              </div>
              <p className="text-sm text-muted-foreground">Lo schermo numeri va aperto su una TV vicino al banco: mostra i numeri in preparazione e pronti.</p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Ritiro e tempi" />
        <CardBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tempo di preparazione stimato" hint="Mostrato al cliente"><Input inputMode="numeric" defaultValue={t.estimated_minutes} onBlur={(e) => update.mutate({ estimated_minutes: Math.max(1, Number(e.target.value) || 20) })} /></Field>
            <Field label="Ordini massimi all'ora" hint="Vuoto = senza limite"><Input inputMode="numeric" defaultValue={t.max_orders_per_hour ?? ''} onBlur={(e) => update.mutate({ max_orders_per_hour: Number(e.target.value) || null })} /></Field>
          </div>
          <Field label="Modalità di ritiro">
            <Segmented value={t.pickup_mode} onChange={(v) => update.mutate({ pickup_mode: v })} options={[{ value: 'code', label: 'Numero e codice' }, { value: 'qr', label: 'QR da scansionare' }]} />
          </Field>
          <Field label="Avviso per i clienti" optional><Textarea value={notice} onChange={(e) => setNotice(e.target.value)} onBlur={() => notice !== (t.pickup_notice ?? '') && update.mutate({ pickup_notice: notice || null })} placeholder="Es. Ritiro al banco laterale, chiusura cucina alle 22:30." /></Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Dati richiesti al cliente" />
        <CardBody className="grid gap-3">
          {([['field_first_name', 'Nome'], ['field_last_name', 'Cognome'], ['field_phone', 'Telefono'], ['field_email', 'Email']] as const).map(([k, label]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{label}</span>
              <Segmented size="sm" value={t[k] as Mode} onChange={(v) => update.mutate({ [k]: v })} options={[{ value: 'off', label: 'No' }, { value: 'optional', label: 'Facoltativo' }, { value: 'required', label: 'Obbligatorio' }]} />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
