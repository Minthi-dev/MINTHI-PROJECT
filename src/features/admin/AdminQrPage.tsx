import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/controls'
import { Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'
import { Input } from '@/shared/ui/input'
import { useConfirm } from '@/shared/ui/overlay'
import { publicUrl } from '@/shared/lib/url'

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

/** QR fisici stampati da MINTHI: puntano a /qr/:code e si possono riassegnare a un altro locale. */
export function AdminQrPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const data = useQuery({
    queryKey: ['admin', 'qr'],
    queryFn: async () => {
      const [codes, restaurants] = await Promise.all([
        supabase.from('physical_qr_codes').select('*').order('created_at', { ascending: false }),
        supabase.from('restaurants').select('id, name').order('name'),
      ])
      return { codes: unwrap(codes), restaurants: unwrap(restaurants) }
    },
  })
  const mut = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: unknown }>) => { const { error } = await fn(); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qr'] }),
  })
  const download = async (code: string, label: string | null) => {
    const url = await QRCode.toDataURL(publicUrl(`/qr/${code}`), { width: 1024, margin: 2 })
    const a = document.createElement('a')
    a.href = url
    a.download = `minthi-qr-${label || code}.png`
    a.click()
  }

  return (
    <>
      <PageHeader title="QR fisici" description="Il QR stampato resta lo stesso: cambi solo il locale a cui punta (menu asporto)."
        actions={<Button onClick={() => mut.mutate(() => supabase.from('physical_qr_codes').insert({ code: randomCode() }), { onSuccess: () => toast.success('QR creato') })}><Plus />Nuovo QR</Button>} />
      {!data.data ? <Skeleton className="h-64" /> : data.data.codes.length === 0 ? <EmptyState title="Nessun QR fisico" /> : (
        <Card>
          <ul className="divide-y">
            {data.data.codes.map((c) => (
              <li key={c.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[140px_1fr_220px_auto]">
                <code className="text-sm font-semibold">{c.code}</code>
                <Input defaultValue={c.label ?? ''} placeholder="Etichetta (es. bancone)" onBlur={(e) => e.target.value !== (c.label ?? '') && mut.mutate(() => supabase.from('physical_qr_codes').update({ label: e.target.value || null }).eq('id', c.id))} />
                <Select value={c.restaurant_id ?? 'none'} onValueChange={(v) => mut.mutate(() => supabase.from('physical_qr_codes').update({ restaurant_id: v === 'none' ? null : v, assigned_at: v === 'none' ? null : new Date().toISOString() }).eq('id', c.id), { onSuccess: () => toast.success('QR assegnato') })}
                  options={[{ value: 'none', label: 'Non assegnato' }, ...data.data.restaurants.map((r) => ({ value: r.id, label: r.name }))]} />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Scarica" onClick={() => download(c.code, c.label)}><Download /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Elimina" onClick={async () => { if (await confirm({ title: 'Eliminare il QR?', description: 'Chi lo inquadra vedrà un errore.', danger: true, confirmLabel: 'Elimina' })) mut.mutate(() => supabase.from('physical_qr_codes').delete().eq('id', c.id)) }}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
