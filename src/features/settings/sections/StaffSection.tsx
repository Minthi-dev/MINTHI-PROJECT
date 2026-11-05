import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MoreVertical, Plus, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth, useRestaurant } from '@/features/auth/AuthProvider'
import { roleLabel } from '@/features/shell/UserMenu'
import { callFunction, unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Segmented, SwitchRow } from '@/shared/ui/controls'
import { Badge, Callout, Card, CardHeader, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useConfirm } from '@/shared/ui/overlay'

interface Member { user_id: string; role: string; display_name: string; can_take_payments: boolean; is_active: boolean; profiles: { username: string | null; email: string | null } | null }

function useStaff() {
  const r = useRestaurant()
  return useQuery({
    queryKey: ['r', r.id, 'staff'],
    queryFn: async () => unwrap(await supabase.from('memberships').select('user_id, role, display_name, can_take_payments, is_active, profiles(username, email)').eq('restaurant_id', r.id).order('created_at')) as unknown as Member[],
  })
}

function useStaffAction() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => callFunction('staff', { ...body, restaurantId: r.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['r', r.id, 'staff'] }),
  })
}

export function StaffSection() {
  const r = useRestaurant()
  const { session } = useAuth()
  const staff = useStaff()
  const action = useStaffAction()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<Member | 'new' | null>(null)
  const [pwFor, setPwFor] = useState<Member | null>(null)

  return (
    <div className="grid gap-6">
      <Callout title="Accesso dello staff">
        Ogni persona entra da <strong>{location.host}/accedi</strong> con il proprio username e password. Nessuna password condivisa: puoi disattivare un account in un attimo.
      </Callout>
      <Card>
        <CardHeader title="Staff" actions={<Button size="sm" onClick={() => setDialog('new')}><Plus />Aggiungi</Button>} />
        {!staff.data ? <Skeleton className="m-5 h-40" /> : (
          <ul className="divide-y">
            {staff.data.map((m) => {
              const isMe = m.user_id === session?.user.id
              const editable = !isMe && m.role !== 'owner' && (r.isOwner || m.role === 'waiter' || m.role === 'kitchen')
              return (
                <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted"><UserRound className="size-4 text-muted-foreground" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.display_name || m.profiles?.email} {isMe && <span className="text-muted-foreground">(tu)</span>}</p>
                    <p className="truncate text-sm text-muted-foreground">{m.profiles?.username ? `@${m.profiles.username}` : m.profiles?.email}</p>
                  </div>
                  <div className="hidden flex-wrap gap-1 sm:flex">
                    <Badge tone={m.role === 'owner' ? 'solid' : 'neutral'}>{roleLabel(m.role)}</Badge>
                    {m.role === 'waiter' && m.can_take_payments && <Badge tone="brand">incassa</Badge>}
                    {!m.is_active && <Badge tone="danger">disattivato</Badge>}
                  </div>
                  {editable && (
                    <Menu>
                      <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni"><MoreVertical /></Button></MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => setDialog(m)}>Modifica</MenuItem>
                        <MenuItem onSelect={() => setPwFor(m)}><KeyRound />Nuova password</MenuItem>
                        <MenuItem onSelect={() => action.mutate({ action: 'update', userId: m.user_id, isActive: !m.is_active }, { onSuccess: () => toast.success(m.is_active ? 'Account disattivato' : 'Account riattivato') })}>{m.is_active ? 'Disattiva' : 'Riattiva'}</MenuItem>
                        <MenuSeparator />
                        <MenuItem danger onSelect={async () => { if (await confirm({ title: `Eliminare ${m.display_name}?`, description: "L'account verrà cancellato.", danger: true, confirmLabel: 'Elimina' })) action.mutate({ action: 'delete', userId: m.user_id }, { onSuccess: () => toast.success('Eliminato') }) }}><Trash2 />Elimina</MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <MemberDialog value={dialog} onClose={() => setDialog(null)} />
      <PasswordDialog member={pwFor} onClose={() => setPwFor(null)} />
    </div>
  )
}

function MemberDialog({ value, onClose }: { value: Member | 'new' | null; onClose: () => void }) {
  const r = useRestaurant()
  const action = useStaffAction()
  const m = value && value !== 'new' ? value : null
  const [f, setF] = useState({ displayName: '', username: '', password: '', role: 'waiter', canTakePayments: false })
  useEffect(() => { if (value) setF({ displayName: m?.display_name ?? '', username: m?.profiles?.username ?? '', password: '', role: m?.role ?? 'waiter', canTakePayments: m?.can_take_payments ?? false }) }, [value, m])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (m) await action.mutateAsync({ action: 'update', userId: m.user_id, displayName: f.displayName, role: f.role, canTakePayments: f.canTakePayments })
    else await action.mutateAsync({ action: 'create', displayName: f.displayName, username: f.username, password: f.password, role: f.role, canTakePayments: f.canTakePayments })
    toast.success(m ? 'Salvato' : `Account creato: ${f.username}`)
    onClose()
  }
  const roles = [{ value: 'waiter', label: 'Sala' }, { value: 'kitchen', label: 'Cucina' }, ...(r.isOwner ? [{ value: 'manager', label: 'Responsabile' }] : [])]

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={m ? 'Modifica membro' : 'Nuovo membro dello staff'} size="sm">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Nome"><Input required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="Mario" /></Field>
          {!m && <>
            <Field label="Username" hint="Lettere minuscole, numeri, punto. Es. mario o mario.rossi"><Input required autoCapitalize="none" pattern="[a-z0-9._\-]{3,32}" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></Field>
            <Field label="Password" hint="Almeno 8 caratteri"><Input required minLength={8} type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </>}
          <Field label="Ruolo"><Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} className="w-full" options={roles} /></Field>
          <p className="text-xs text-muted-foreground">
            {{ waiter: 'Sala: tavoli, ordini, prenotazioni e asporto.', kitchen: 'Cucina: vede e aggiorna solo i piatti da preparare.', manager: 'Responsabile: tutto, tranne pagamenti online, scontrini e abbonamento.' }[f.role]}
          </p>
          {f.role === 'waiter' && <SwitchRow title="Può incassare" description="Registrare pagamenti ed emettere scontrini." checked={f.canTakePayments} onCheckedChange={(v) => setF({ ...f, canTakePayments: v })} />}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={action.isPending}>{m ? 'Salva' : 'Crea account'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const action = useStaffAction()
  const [pw, setPw] = useState('')
  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) { setPw(''); onClose() } }}>
      <DialogContent title={`Nuova password per ${member?.display_name}`} size="sm">
        <form onSubmit={async (e) => { e.preventDefault(); await action.mutateAsync({ action: 'update', userId: member!.user_id, password: pw }); toast.success('Password aggiornata'); setPw(''); onClose() }}>
          <Field label="Password" hint="Almeno 8 caratteri. Comunicala di persona."><Input required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={action.isPending}>Salva</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
