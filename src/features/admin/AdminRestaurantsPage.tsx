import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { formatDate, formatMoney, toDateInput } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/controls'
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'
import { AffixInput, Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, Sheet, useConfirm } from '@/shared/ui/overlay'
import { useAdminAction, useOverview, type Overview } from './queries'

type Row = Overview['perRestaurant'][number]
const SUB: Record<string, string> = { trialing: 'Prova', active: 'Attivo', past_due: 'In ritardo', canceled: 'Disdetto', free: 'Gratuito' }

export function AdminRestaurantsPage() {
  const o = useOverview()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const rows = useMemo(() => (o.data?.perRestaurant ?? []).filter((r) => `${r.name} ${r.owner}`.toLowerCase().includes(q.toLowerCase())), [o.data, q])
  return (
    <>
      <PageHeader title="Ristoranti" actions={<Button onClick={() => setCreating(true)}><Plus />Nuovo ristorante</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o email" className="pl-9" />
      </div>
      {!o.data ? <Skeleton className="h-96" /> : <RestaurantsTable rows={rows} />}
      <CreateRestaurantDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

export function RestaurantsTable({ rows, compact }: { rows: Row[]; compact?: boolean }) {
  const [selected, setSelected] = useState<Row | null>(null)
  if (!rows.length) return <EmptyState title="Nessun ristorante" />
  return (
    <Card>
      {compact && <CardHeader title="Ristoranti più attivi" />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground"><tr>
            <th className="px-4 py-2.5 font-medium">Ristorante</th><th className="px-4 py-2.5 font-medium">Titolare</th>
            <th className="px-4 py-2.5 font-medium">Abbonamento</th><th className="px-4 py-2.5 text-right font-medium">Ordini 30g</th><th className="px-4 py-2.5 text-right font-medium">Transato 30g</th>
          </tr></thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-muted/50">
                <td className="px-4 py-3 font-medium">{r.name} {r.status === 'suspended' && <Badge tone="danger" className="ml-1">sospeso</Badge>}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.owner ?? '—'}</td>
                <td className="px-4 py-3"><Badge>{SUB[r.subscriptionStatus ?? ''] ?? '—'}</Badge></td>
                <td className="px-4 py-3 text-right tabular">{r.orders30d}</td>
                <td className="px-4 py-3 text-right tabular">{formatMoney(r.gmv30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RestaurantSheet row={selected} onClose={() => setSelected(null)} />
    </Card>
  )
}

function RestaurantSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const navigate = useNavigate()
  const { setCurrentRestaurant, refresh } = useAuth()
  const confirm = useConfirm()
  const action = useAdminAction()
  const billing = useQuery({
    queryKey: ['admin', 'billing', row?.id], enabled: !!row,
    queryFn: async () => unwrap(await supabase.from('billing_accounts').select('*').eq('restaurant_id', row!.id).maybeSingle()),
  })
  const [months, setMonths] = useState('1')
  const [amount, setAmount] = useState('')
  const [until, setUntil] = useState(toDateInput(new Date(Date.now() + 30 * 86400_000)))

  if (!row) return null
  const run = (body: Record<string, unknown>, ok: string) => action.mutate({ restaurantId: row.id, ...body }, { onSuccess: () => { toast.success(ok); billing.refetch() } })

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()} title={row.name} description={`Creato il ${formatDate(row.createdAt)} · ${row.owner ?? 'senza titolare'}`}>
      <div className="grid gap-4 p-4">
        <Button variant="outline" onClick={() => { refresh(); setCurrentRestaurant(row.id); navigate('/app') }}><ExternalLink />Apri la gestione del locale</Button>
        <Card>
          <CardHeader title="Abbonamento" description={billing.data?.current_period_end ? `Scadenza: ${formatDate(billing.data.current_period_end)}` : 'Nessuna scadenza impostata'} />
          <CardBody className="grid gap-3">
            <Field label="Stato">
              <Select value={billing.data?.subscription_status ?? 'active'} onValueChange={(v) => run({ action: 'set_subscription', status: v }, 'Stato aggiornato')}
                options={Object.entries(SUB).map(([value, label]) => ({ value, label }))} />
            </Field>
            <div className="flex items-end gap-2">
              <Field label="Mesi gratuiti" className="flex-1"><Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
              <Button variant="outline" onClick={() => run({ action: 'grant_bonus', freeMonths: Number(months) || 1 }, 'Bonus assegnato')}>Regala</Button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label="Pagamento ricevuto"><AffixInput prefix="€" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Copre fino al"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
              <Button variant="outline" disabled={!Number(amount.replace(',', '.'))} onClick={() => run({ action: 'record_subscription_payment', amount: Number(amount.replace(',', '.')), periodStart: new Date().toISOString(), periodEnd: new Date(`${until}T23:59`).toISOString() }, 'Pagamento registrato')}>Registra</Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Accesso e stato" />
          <CardBody className="grid gap-2">
            <Button variant="outline" onClick={() => action.mutate({ action: 'owner_recovery_link', restaurantId: row.id }, {
              onSuccess: (d) => { const { link } = d as { link: string }; navigator.clipboard.writeText(link); toast.success('Link di accesso copiato: invialo al titolare') },
            })}><Copy />Link per reimpostare la password del titolare</Button>
            {row.status === 'active'
              ? <Button variant="outline" onClick={async () => { if (await confirm({ title: `Sospendere ${row.name}?`, description: 'I clienti non potranno più ordinare.', danger: true, confirmLabel: 'Sospendi' })) run({ action: 'set_status', status: 'suspended', reason: 'Sospeso da MINTHI' }, 'Ristorante sospeso') }}>Sospendi</Button>
              : <Button variant="outline" onClick={() => run({ action: 'set_status', status: 'active' }, 'Ristorante riattivato')}>Riattiva</Button>}
            <Button variant="danger-ghost" onClick={async () => {
              const name = window.prompt(`Per eliminare definitivamente scrivi il nome: ${row.name}`)
              if (name) action.mutate({ action: 'delete_restaurant', restaurantId: row.id, confirmName: name }, { onSuccess: () => { toast.success('Ristorante eliminato'); onClose() } })
            }}>Elimina definitivamente</Button>
          </CardBody>
        </Card>
      </div>
    </Sheet>
  )
}

function CreateRestaurantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const action = useAdminAction<{ recoveryLink: string | null }>()
  const [f, setF] = useState({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '', freeMonths: '1' })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nuovo ristorante" description="Crea il locale e l'account del titolare. In alternativa usa un invito.">
        <form className="grid gap-4" onSubmit={(e) => {
          e.preventDefault()
          action.mutate({ action: 'create_restaurant', name: f.name, ownerName: f.ownerName, ownerEmail: f.ownerEmail, ownerPassword: f.ownerPassword || undefined, freeMonths: Number(f.freeMonths) || 0 }, {
            onSuccess: (d) => {
              if (d.recoveryLink) { navigator.clipboard.writeText(d.recoveryLink); toast.success('Creato. Link per impostare la password copiato.') } else toast.success('Ristorante creato')
              onClose()
            },
          })
        }}>
          <Field label="Nome del locale"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome titolare"><Input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field>
            <Field label="Email titolare"><Input required type="email" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} /></Field>
          </div>
          <Field label="Password iniziale" optional hint="Se vuota, ottieni un link da inviare al titolare per sceglierla."><Input minLength={8} value={f.ownerPassword} onChange={(e) => setF({ ...f, ownerPassword: e.target.value })} /></Field>
          <Field label="Mesi gratuiti"><Input inputMode="numeric" value={f.freeMonths} onChange={(e) => setF({ ...f, freeMonths: e.target.value })} className="w-24" /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={action.isPending}>Crea</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
