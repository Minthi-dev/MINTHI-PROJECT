import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { uploadImage } from '@/features/menu/queries'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Segmented, SwitchRow } from '@/shared/ui/controls'
import { Callout, Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { useRestaurantRow, useSettings, useUpdateRestaurant, useUpdateSettings } from '../queries'

const ACCENTS = ['#10b981', '#0ea5e9', '#6366f1', '#e11d48', '#f59e0b', '#a16207', '#111827']

export function GeneralSection() {
  const r = useRestaurant()
  const [params] = useSearchParams()
  const row = useRestaurantRow()
  const settings = useSettings()
  const updateR = useUpdateRestaurant()
  const updateS = useUpdateSettings()
  const [f, setF] = useState({ name: '', address: '', phone: '', email: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (row.data) setF({ name: row.data.name, address: row.data.address ?? '', phone: row.data.phone ?? '', email: row.data.email ?? '' })
  }, [row.data])

  if (!row.data || !settings.data) return <Skeleton className="h-96" />
  const s = settings.data
  const theme = (s.menu_theme ?? {}) as { style?: string; accent?: string }

  return (
    <div className="grid gap-6">
      {params.get('benvenuto') && (
        <Callout tone="success" title="Benvenuto in MINTHI!">Completa i dati del locale, poi crea il menu e i tavoli. In <strong>Orari e prezzi</strong> imposti coperto e All You Can Eat.</Callout>
      )}
      <Card>
        <CardHeader title="Dati del locale" description="Mostrati ai clienti su menu, asporto e prenotazioni." />
        <CardBody>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); updateR.mutate({ name: f.name.trim(), address: f.address || null, phone: f.phone || null, email: f.email || null }) }}>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted text-muted-foreground">
                {row.data.logo_url ? <img src={row.data.logo_url} alt="Logo" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
              </button>
              <div className="grid gap-1 text-sm">
                <p className="font-medium">Logo</p>
                <p className="text-muted-foreground">{uploading ? 'Caricamento…' : 'Quadrato, almeno 256 px.'}</p>
                {row.data.logo_url && <button type="button" className="justify-self-start text-danger" onClick={() => updateR.mutate({ logo_url: null })}>Rimuovi</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true)
                try { updateR.mutate({ logo_url: await uploadImage('logos', r.id, file) }) } catch (err) { toast.error(errorMessage(err)) } finally { setUploading(false) }
              }} />
            </div>
            <Field label="Nome"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Indirizzo"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefono"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            </div>
            <Button type="submit" className="justify-self-start" loading={updateR.isPending}>Salva</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Menu dei clienti" description="Aspetto e regole del menu che si apre dal QR." />
        <CardBody className="grid gap-5">
          <Field label="Stile">
            <Segmented value={theme.style ?? 'elegant'} onChange={(v) => updateS.mutate({ menu_theme: { ...theme, style: v } })} options={[{ value: 'elegant', label: 'Elegante' }, { value: 'modern', label: 'Moderno' }, { value: 'minimal', label: 'Essenziale' }]} />
          </Field>
          <Field label="Colore principale">
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => updateS.mutate({ menu_theme: { ...theme, accent: c } })}
                  className={cn('size-9 rounded-full border-2 border-surface shadow-sm ring-2', (theme.accent ?? '#10b981') === c ? 'ring-foreground' : 'ring-transparent')} style={{ background: c }} />
              ))}
            </div>
          </Field>
          <div className="divide-y">
            <SwitchRow title="Ordini dal tavolo" description="I clienti ordinano dal telefono. Se spento, il QR mostra solo il menu." checked={!s.view_only_menu} onCheckedChange={(v) => updateS.mutate({ view_only_menu: !v })} />
            <SwitchRow title="Portate" description="I clienti e la sala possono dividere l'ordine in 1ª, 2ª, 3ª portata." checked={s.courses_enabled} onCheckedChange={(v) => updateS.mutate({ courses_enabled: v })} />
            <SwitchRow title="Servizio automatico" description="Quando la cucina segna un piatto pronto, risulta subito servito (utile per banconi e self-service)." checked={s.auto_serve_ready_items} onCheckedChange={(v) => updateS.mutate({ auto_serve_ready_items: v })} />
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
