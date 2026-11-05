import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Select, Switch, SwitchRow } from '@/shared/ui/controls'
import { Callout, Card, CardBody, CardHeader, Skeleton } from '@/shared/ui/display'
import { AffixInput, Field, Input } from '@/shared/ui/input'
import { useSettings, useUpdateSettings } from '../queries'

interface Ayce { price: number; maxRounds: number; intervalMin: number }
interface Period { start: string; end: string; cover?: number | null; ayce?: Ayce | false }
interface Day { lunch: Period | null; dinner: Period | null }

const ORDER = [1, 2, 3, 4, 5, 6, 0]
const NAMES = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const DEF: Record<'lunch' | 'dinner', Period> = { lunch: { start: '12:00', end: '15:00' }, dinner: { start: '19:00', end: '23:30' } }
const num = (s: string) => Number(s.replace(',', '.')) || 0

export function ScheduleSection() {
  const settings = useSettings()
  const update = useUpdateSettings()
  const [days, setDays] = useState<Day[]>([])
  const [cover, setCover] = useState('0')
  const [ayce, setAyce] = useState<Ayce | null>(null)

  useEffect(() => {
    const s = settings.data
    if (!s) return
    const raw = ((s.weekly_schedule as { days?: (Day | null)[] })?.days ?? []) as (Day | null)[]
    setDays(Array.from({ length: 7 }, (_, i) => raw[i] ?? { lunch: null, dinner: null }))
    setCover(String(s.cover_default).replace('.', ','))
    setAyce((s.ayce_default as Ayce | null) ?? null)
  }, [settings.data])

  if (!settings.data || days.length !== 7) return <Skeleton className="h-96" />

  const setPeriod = (d: number, p: 'lunch' | 'dinner', v: Period | null) => setDays((ds) => ds.map((x, i) => (i === d ? { ...x, [p]: v } : x)))
  const save = () => update.mutate({ weekly_schedule: { days } as never, cover_default: num(cover), ayce_default: ayce as never })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Coperto" description="Aggiunto al conto per ogni persona. In sala puoi toglierlo all'apertura del tavolo." />
        <CardBody><Field label="Prezzo standard a persona"><AffixInput prefix="€" inputMode="decimal" value={cover} onChange={(e) => setCover(e.target.value)} className="w-32" /></Field></CardBody>
      </Card>

      <Card>
        <CardHeader title="All You Can Eat" description="Formula a prezzo fisso a persona: i piatti inclusi diventano gratuiti." />
        <CardBody className="grid gap-4">
          <SwitchRow title="Offri l'All You Can Eat" checked={!!ayce} onCheckedChange={(v) => setAyce(v ? { price: 25, maxRounds: 0, intervalMin: 0 } : null)} />
          {ayce && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Prezzo a persona"><AffixInput prefix="€" inputMode="decimal" value={String(ayce.price).replace('.', ',')} onChange={(e) => setAyce({ ...ayce, price: num(e.target.value) })} /></Field>
              <Field label="Ordini massimi" hint="0 = illimitati"><Input inputMode="numeric" value={ayce.maxRounds} onChange={(e) => setAyce({ ...ayce, maxRounds: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
              <Field label="Minuti tra un ordine e l'altro" hint="0 = nessuna attesa"><Input inputMode="numeric" value={ayce.intervalMin} onChange={(e) => setAyce({ ...ayce, intervalMin: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Orari settimanali" description="Servono per i menu programmati e per applicare prezzi diversi a pranzo e cena."
          actions={<Button variant="outline" size="sm" onClick={() => setDays((ds) => ds.map(() => structuredClone(ds[1])))}><Copy />Copia il lunedì su tutti</Button>} />
        <CardBody className="grid gap-1 p-0">
          {ORDER.map((d) => (
            <div key={d} className="grid gap-3 border-b px-5 py-4 last:border-0 md:grid-cols-[110px_1fr_1fr]">
              <p className="pt-2 text-sm font-semibold">{NAMES[d]}</p>
              {(['lunch', 'dinner'] as const).map((p) => (
                <PeriodEditor key={p} label={p === 'lunch' ? 'Pranzo' : 'Cena'} value={days[d][p]} ayceOn={!!ayce} defaultCover={num(cover)}
                  onChange={(v) => setPeriod(d, p, v)} onToggle={(on) => setPeriod(d, p, on ? { ...DEF[p] } : null)} />
              ))}
            </div>
          ))}
        </CardBody>
      </Card>

      <Callout>I prezzi di coperto e AYCE vengono fissati quando apri il tavolo: cambiare queste impostazioni non modifica i tavoli già aperti.</Callout>
      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4"><Button size="lg" onClick={save} loading={update.isPending} className="shadow-lg">Salva orari e prezzi</Button></div>
    </div>
  )
}

function PeriodEditor({ label, value, onChange, onToggle, ayceOn, defaultCover }: { label: string; value: Period | null; onChange: (v: Period) => void; onToggle: (on: boolean) => void; ayceOn: boolean; defaultCover: number }) {
  const ayceMode = value?.ayce === false ? 'off' : value?.ayce ? 'custom' : 'default'
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <label className="flex items-center justify-between text-sm font-medium">{label}<Switch checked={!!value} onCheckedChange={onToggle} /></label>
      {value ? (
        <>
          <div className="flex items-center gap-2">
            <Input type="time" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} aria-label={`${label} inizio`} />
            <span className="text-muted-foreground">–</span>
            <Input type="time" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} aria-label={`${label} fine`} />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Prezzi di questa fascia</summary>
            <div className="mt-2 grid gap-2">
              <Field label="Coperto" hint={`Vuoto = ${defaultCover.toFixed(2).replace('.', ',')} €`}>
                <AffixInput prefix="€" inputMode="decimal" value={value.cover ?? ''} onChange={(e) => onChange({ ...value, cover: e.target.value === '' ? null : num(e.target.value) })} />
              </Field>
              {ayceOn && (
                <Field label="All You Can Eat">
                  <Select value={ayceMode} onValueChange={(m) => onChange({ ...value, ayce: m === 'off' ? false : m === 'custom' ? { price: 25, maxRounds: 0, intervalMin: 0 } : undefined })}
                    options={[{ value: 'default', label: 'Come standard' }, { value: 'off', label: 'Non disponibile' }, { value: 'custom', label: 'Prezzo diverso' }]} />
                </Field>
              )}
              {ayceOn && value.ayce && (
                <AffixInput prefix="€" inputMode="decimal" aria-label="Prezzo AYCE fascia" value={String(value.ayce.price).replace('.', ',')} onChange={(e) => onChange({ ...value, ayce: { ...(value.ayce as Ayce), price: num(e.target.value) } })} />
              )}
            </div>
          </details>
        </>
      ) : <p className="text-sm text-muted-foreground">Chiuso</p>}
    </div>
  )
}
