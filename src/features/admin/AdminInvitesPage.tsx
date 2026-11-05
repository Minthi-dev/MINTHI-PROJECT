import { useQuery } from '@tanstack/react-query'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { unwrap } from '@/shared/lib/api'
import { formatDate } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/controls'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'
import { useAdminAction } from './queries'

const link = (token: string) => `${location.origin}/registrati/${token}`

export function AdminInvitesPage() {
  const invites = useQuery({ queryKey: ['admin', 'invites'], queryFn: async () => unwrap(await supabase.from('invites').select('*, restaurants:used_by_restaurant_id(name)').order('created_at', { ascending: false })) })
  const del = useAdminAction('Invito eliminato')
  const [open, setOpen] = useState(false)
  return (
    <>
      <PageHeader title="Inviti" description="Link personali per far registrare un nuovo ristorante, con eventuali mesi gratuiti." actions={<Button onClick={() => setOpen(true)}><Plus />Nuovo invito</Button>} />
      {!invites.data ? <Skeleton className="h-64" /> : invites.data.length === 0 ? <EmptyState title="Nessun invito" /> : (
        <Card>
          <ul className="divide-y">
            {invites.data.map((i) => {
              const used = !!i.used_at
              const expired = !used && new Date(i.expires_at) < new Date()
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.note || 'Invito'} {i.free_months > 0 && <Badge tone="brand" className="ml-1">{i.free_months} mesi gratis</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{used ? `Usato da ${(i as unknown as { restaurants?: { name?: string } }).restaurants?.name ?? 'un ristorante'}` : `Scade il ${formatDate(i.expires_at)}`}</p>
                  </div>
                  <Badge tone={used ? 'neutral' : expired ? 'danger' : 'success'}>{used ? 'Usato' : expired ? 'Scaduto' : 'Attivo'}</Badge>
                  {!used && !expired && <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link(i.token)); toast.success('Link copiato') }}><Copy />Copia link</Button>}
                  {!used && <Button variant="ghost" size="icon-sm" aria-label="Elimina" onClick={() => del.mutate({ action: 'delete_invite', inviteId: i.id })}><Trash2 /></Button>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <InviteDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useAdminAction<{ token: string }>()
  const [f, setF] = useState({ note: '', freeMonths: '1', expiresInDays: '30' })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nuovo invito" size="sm">
        <form className="grid gap-4" onSubmit={(e) => {
          e.preventDefault()
          create.mutate({ action: 'create_invite', note: f.note || undefined, freeMonths: Number(f.freeMonths) || 0, expiresInDays: Number(f.expiresInDays) || 30 }, {
            onSuccess: (d) => { navigator.clipboard.writeText(link(d.token)); toast.success('Invito creato e link copiato'); onClose() },
          })
        }}>
          <Field label="Nota" optional hint="Per ricordarti a chi l'hai mandato"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Es. Pizzeria Da Gino" /></Field>
          <Field label="Mesi gratuiti"><Input inputMode="numeric" value={f.freeMonths} onChange={(e) => setF({ ...f, freeMonths: e.target.value })} /></Field>
          <Field label="Validità"><Select value={f.expiresInDays} onValueChange={(v) => setF({ ...f, expiresInDays: v })} options={[{ value: '7', label: '7 giorni' }, { value: '30', label: '30 giorni' }, { value: '90', label: '90 giorni' }]} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={create.isPending}>Crea invito</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
