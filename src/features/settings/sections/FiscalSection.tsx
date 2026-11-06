import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FlaskConical, Receipt, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { callFunction, unwrap } from '@/shared/lib/api'
import { errorMessage } from '@/shared/lib/errors'
import { formatDate, formatDateTime, formatMoney, VAT_CODES } from '@/shared/lib/format'
import { supabase, type Tables } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select, SwitchRow } from '@/shared/ui/controls'
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, useConfirm } from '@/shared/ui/overlay'

interface FiscalStatus { env: 'test' | 'production'; providerConfigured: boolean; settings: Tables<'fiscal_settings'> | null }

const STATUS_TONE = { pending: 'warning', submitted: 'info', ready: 'success', failed: 'danger', voided: 'neutral' } as const
const STATUS_LABEL = { pending: 'In coda', submitted: 'Inviato', ready: 'Emesso', failed: 'Errore', voided: 'Annullato' } as const

export function FiscalSection() {
  const r = useRestaurant()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [configuring, setConfiguring] = useState(false)
  const status = useQuery({ queryKey: ['r', r.id, 'fiscal'], queryFn: () => callFunction<FiscalStatus>('fiscal', { action: 'status', restaurantId: r.id }) })
  const receipts = useQuery({
    queryKey: ['r', r.id, 'fiscal', 'receipts'],
    queryFn: async () => unwrap(await supabase.from('fiscal_receipts').select('*').eq('restaurant_id', r.id).order('created_at', { ascending: false }).limit(50)),
  })
  const update = useMutation({
    mutationFn: async (patch: Partial<Pick<Tables<'fiscal_settings'>, 'enabled' | 'auto_issue_online_payments' | 'email_to_customer' | 'default_vat_rate_code'>>) =>
      unwrap(await supabase.from('fiscal_settings').update(patch).eq('restaurant_id', r.id).select().single()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['r', r.id, 'fiscal'] }); toast.success('Salvato') },
  })
  const voidReceipt = useMutation({
    mutationFn: (id: string) => callFunction('fiscal', { action: 'void', restaurantId: r.id, receiptId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['r', r.id, 'fiscal'] }); toast.success('Scontrino annullato') },
  })

  const download = async (id: string) => {
    try {
      const res = await callFunction<{ filename: string; base64: string }>('fiscal', { action: 'pdf', restaurantId: r.id, receiptId: id })
      const a = document.createElement('a')
      a.href = `data:application/pdf;base64,${res.base64}`
      a.download = res.filename
      a.click()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (!status.data) return <Skeleton className="h-96" />
  const fs = status.data.settings
  const active = fs?.status === 'active'
  const expiring = !!fs?.ade_credentials_expire_at && new Date(fs.ade_credentials_expire_at).getTime() - Date.now() < 15 * 86400_000

  return (
    <div className="grid gap-6">
      {status.data.env === 'test' && (
        <Callout tone="warning" icon={FlaskConical} title="Ambiente di prova">Gli scontrini vanno alla sandbox: non hanno valore fiscale e non arrivano all'Agenzia delle Entrate.</Callout>
      )}
      <Card>
        <CardHeader
          title="Scontrini elettronici"
          description="Documento commerciale online trasmesso all'Agenzia delle Entrate, senza registratore di cassa."
          actions={<Badge tone={active ? 'success' : fs?.status === 'error' ? 'danger' : 'neutral'}>{active ? 'Attivo' : fs?.status === 'error' ? 'Errore' : fs?.status === 'pending' ? 'In attivazione' : 'Non configurato'}</Badge>}
        />
        <CardBody className="grid gap-4">
          {!active ? (
            <>
              <p className="text-sm text-muted-foreground">Servono la Partita IVA e le credenziali Fisconline/Entratel di chi trasmette i corrispettivi (codice fiscale, password e PIN). Vanno rinnovate ogni 90 giorni.</p>
              {fs?.last_error && <Callout tone="danger" title="Ultimo tentativo non riuscito">{fs.last_error.slice(0, 300)}</Callout>}
              <Button className="justify-self-start" onClick={() => setConfiguring(true)} disabled={!status.data.providerConfigured}><ShieldCheck />Configura scontrini</Button>
            </>
          ) : (
            <>
              <div className="grid gap-1 text-sm">
                <p><span className="text-muted-foreground">Partita IVA:</span> {fs.tax_code}</p>
                {fs.ade_credentials_expire_at && <p><span className="text-muted-foreground">Credenziali AdE valide fino al:</span> {formatDate(fs.ade_credentials_expire_at)}</p>}
              </div>
              {expiring && <Callout tone="warning" title="Credenziali in scadenza">Aggiornale per non bloccare l'emissione.</Callout>}
              <div className="divide-y">
                <SwitchRow title="Emissione attiva" checked={fs.enabled} onCheckedChange={(v) => update.mutate({ enabled: v })} />
                <SwitchRow title="Automatica per i pagamenti online" description="Tavolo o asporto pagati con carta: lo scontrino parte da solo." checked={fs.auto_issue_online_payments} onCheckedChange={(v) => update.mutate({ auto_issue_online_payments: v })} />
                <SwitchRow title="Invia lo scontrino via email" description="Se il cliente ha lasciato la sua email." checked={fs.email_to_customer} onCheckedChange={(v) => update.mutate({ email_to_customer: v })} />
              </div>
              <Field label="IVA per coperto e AYCE"><Select value={fs.default_vat_rate_code} onValueChange={(v) => update.mutate({ default_vat_rate_code: v })} options={VAT_CODES} className="max-w-xs" /></Field>
              <Button variant="outline" className="justify-self-start" onClick={() => setConfiguring(true)}>Aggiorna credenziali</Button>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ultimi scontrini" />
        {!receipts.data ? <Skeleton className="m-5 h-40" /> : receipts.data.length === 0 ? (
          <CardBody><EmptyState icon={Receipt} title="Nessuno scontrino emesso" /></CardBody>
        ) : (
          <ul className="divide-y">
            {receipts.data.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{x.document_number ?? 'In emissione'} <span className="font-normal text-muted-foreground">· {formatDateTime(x.created_at)}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{x.issued_via === 'manual' ? 'Manuale' : 'Automatico'}{x.error ? ` · ${x.error}` : ''}</p>
                </div>
                <Badge tone={STATUS_TONE[x.status as keyof typeof STATUS_TONE]}>{STATUS_LABEL[x.status as keyof typeof STATUS_LABEL]}</Badge>
                <span className="w-20 text-right font-medium tabular">{formatMoney(x.total)}</span>
                {['submitted', 'ready'].includes(x.status) && (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label="Scarica PDF" onClick={() => download(x.id)}><Download /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Annulla scontrino" onClick={async () => {
                      if (await confirm({ title: 'Annullare lo scontrino?', description: "Viene trasmesso un annullo all'Agenzia delle Entrate.", danger: true, confirmLabel: 'Annulla scontrino' })) voidReceipt.mutate(x.id)
                    }}><XCircle /></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfigureDialog open={configuring} onClose={() => setConfiguring(false)} />
    </div>
  )
}

function ConfigureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useRestaurant()
  const qc = useQueryClient()
  const [f, setF] = useState({ vatNumber: '', businessName: '', email: '', adeTaxCode: '', adePassword: '', adePin: '' })
  const save = useMutation({
    mutationFn: () => callFunction('fiscal', { action: 'configure', restaurantId: r.id, ...f }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['r', r.id] }); toast.success('Scontrini elettronici attivi'); onClose() },
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Configura scontrini elettronici" description="Le credenziali vanno direttamente al provider fiscale: MINTHI non le salva.">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Partita IVA"><Input required inputMode="numeric" value={f.vatNumber} onChange={set('vatNumber')} /></Field>
            <Field label="Email aziendale"><Input required type="email" value={f.email} onChange={set('email')} /></Field>
          </div>
          <Field label="Ragione sociale"><Input required value={f.businessName} onChange={set('businessName')} /></Field>
          <p className="pt-2 text-sm font-medium">Credenziali Fisconline / Entratel</p>
          <Field label="Codice fiscale"><Input required value={f.adeTaxCode} onChange={(e) => setF({ ...f, adeTaxCode: e.target.value.toUpperCase() })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password"><Input required type="password" autoComplete="off" value={f.adePassword} onChange={set('adePassword')} /></Field>
            <Field label="PIN"><Input required type="password" autoComplete="off" value={f.adePin} onChange={set('adePin')} /></Field>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={save.isPending}>Attiva</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
