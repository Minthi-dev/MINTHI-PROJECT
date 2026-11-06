import { Plug, Printer } from 'lucide-react'
import { usePrinter } from '@/features/printing/usePrinter'
import { Button } from '@/shared/ui/button'
import { Segmented, SwitchRow } from '@/shared/ui/controls'
import { Badge, Callout, Card, CardBody, CardHeader } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'

export function PrinterSection() {
  const p = usePrinter()
  const s = p.settings
  return (
    <div className="grid gap-6">
      <Callout title="Impostazione per questo dispositivo">Ogni tablet o PC ha la sua stampante: configura la stampa su ciascun dispositivo che la usa.</Callout>
      <Card>
        <CardHeader
          title="Stampante termica"
          description="Epson TM-T20, Custom e compatibili ESC/POS, carta 80 o 58 mm."
          actions={s.mode !== 'off' && <Badge tone={p.connected ? 'success' : 'neutral'}>{p.connected ? 'Collegata' : 'Non collegata'}</Badge>}
        />
        <CardBody className="grid gap-5">
          <Field label="Collegamento">
            <Segmented value={s.mode} onChange={(v) => p.update({ mode: v })} options={[{ value: 'off', label: 'Nessuna' }, { value: 'usb', label: 'Cavo USB' }, { value: 'network', label: 'Rete / Wi-Fi' }]} />
          </Field>
          {s.mode === 'usb' && !p.usbSupported && <Callout tone="warning">Questo browser non supporta l'USB: usa Chrome o Edge su computer.</Callout>}
          {s.mode === 'network' && (
            <Field label="Indirizzo del relay" hint="Sul PC del locale avvia: node printer-relay.js IP_STAMPANTE">
              <Input value={s.relayUrl} onChange={(e) => p.update({ relayUrl: e.target.value })} placeholder="ws://localhost:8765" />
            </Field>
          )}
          {s.mode !== 'off' && (
            <>
              <Field label="Larghezza carta">
                <Segmented value={String(s.columns)} onChange={(v) => p.update({ columns: Number(v) as 48 | 32 })} options={[{ value: '48', label: '80 mm' }, { value: '32', label: '58 mm' }]} />
              </Field>
              <SwitchRow title="Stampa comande in cucina" description="Ogni nuovo ordine viene stampato dalla schermata Cucina di questo dispositivo." checked={s.autoPrintKitchen} onCheckedChange={(v) => p.update({ autoPrintKitchen: v })} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => p.connect()}><Plug />Collega</Button>
                <Button onClick={() => p.test()}><Printer />Stampa di prova</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
