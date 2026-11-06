import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { rpc } from '@/shared/lib/api'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { Segmented } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Stat } from '@/shared/ui/display'

interface Analytics {
  revenue: number; payments: number; tables: number; covers: number; takeawayOrders: number; itemsSold: number; avgTicket: number
  byDay: { day: string; revenue: number }[]
  byHour: { hour: number; items: number }[]
  byMethod: { method: string; amount: number }[]
  topDishes: { name: string; quantity: number; revenue: number }[]
  byCategory: { category: string; quantity: number; revenue: number }[]
  prepTimes: { name: string; minutes: number; samples: number }[]
  staff: { name: string; tables: number }[]
}

type Range = 'today' | '7d' | '30d' | '90d'
const METHOD: Record<string, string> = { cash: 'Contanti', card: 'Carta / POS', stripe: 'Online', voucher: 'Buoni pasto', other: 'Altro' }

function rangeDates(r: Range) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (r !== 'today') start.setDate(start.getDate() - ({ '7d': 6, '30d': 29, '90d': 89 }[r]))
  return { from: start.toISOString(), to: new Date(now.getTime() + 60_000).toISOString() }
}

const axis = { fontSize: 12, fill: 'var(--muted-foreground)' }

export function AnalyticsPage() {
  const r = useRestaurant()
  const [range, setRange] = useState<Range>('7d')
  const { from, to } = useMemo(() => rangeDates(range), [range])
  const q = useQuery({
    queryKey: ['r', r.id, 'analytics', range],
    queryFn: async () => (await rpc('restaurant_analytics', { p_restaurant_id: r.id, p_from: from, p_to: to })) as unknown as Analytics,
  })
  const a = q.data

  return (
    <>
      <PageHeader title="Analitiche" actions={
        <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Oggi' }, { value: '7d', label: '7 giorni' }, { value: '30d', label: '30 giorni' }, { value: '90d', label: '90 giorni' }]} />
      } />
      {q.isLoading || !a ? <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div> : a.payments === 0 && a.itemsSold === 0 ? (
        <EmptyState icon={BarChart3} title="Ancora nessun dato" description="Le statistiche appaiono dopo i primi incassi." />
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Incasso" value={formatMoney(a.revenue)} hint={`${a.payments} pagamenti`} />
            <Stat label="Scontrino medio" value={formatMoney(a.avgTicket)} />
            <Stat label="Coperti" value={a.covers} hint={`${a.tables} tavoli`} />
            <Stat label="Asporto" value={a.takeawayOrders} hint={`${a.itemsSold} piatti venduti in totale`} />
          </div>

          {range !== 'today' && (
            <Card>
              <CardHeader title="Incasso per giorno" />
              <CardBody className="h-72">
                <ResponsiveContainer>
                  <BarChart data={a.byDay.map((d) => ({ ...d, label: formatDate(d.day, { day: 'numeric', month: 'short' }) }))}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `${v} €`} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v: number) => [formatMoney(v), 'Incasso']} />
                    <Bar dataKey="revenue" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <RankCard title="Piatti più venduti" rows={a.topDishes.map((d) => ({ label: d.name, value: d.quantity, extra: formatMoney(d.revenue) }))} />
            <RankCard title="Per categoria" rows={a.byCategory.sort((x, y) => y.revenue - x.revenue).map((c) => ({ label: c.category, value: c.revenue, display: formatMoney(c.revenue), extra: `${c.quantity} pz` }))} />
            <Card>
              <CardHeader title="Orari di punta" description="Piatti ordinati per ora del giorno" />
              <CardBody className="h-60">
                <ResponsiveContainer>
                  <BarChart data={a.byHour}>
                    <XAxis dataKey="hour" tick={axis} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}`} />
                    <YAxis hide />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v: number) => [v, 'Piatti']} labelFormatter={(h) => `Ore ${h}:00`} />
                    <Bar dataKey="items" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
            <RankCard title="Metodi di pagamento" rows={a.byMethod.map((m) => ({ label: METHOD[m.method] ?? m.method, value: m.amount, display: formatMoney(m.amount) }))} />
            <RankCard title="Tempi di preparazione" description="Media dall'ordine al piatto pronto" rows={a.prepTimes.map((p) => ({ label: p.name, value: p.minutes, display: `${p.minutes} min` }))} />
            <RankCard title="Tavoli aperti per membro dello staff" rows={a.staff.sort((x, y) => y.tables - x.tables).map((s) => ({ label: s.name, value: s.tables }))} />
          </div>
        </div>
      )}
    </>
  )
}

function RankCard({ title, description, rows }: { title: string; description?: string; rows: { label: string; value: number; display?: string; extra?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nessun dato</p> : (
          <ul className="grid gap-3">
            {rows.slice(0, 10).map((r) => (
              <li key={r.label} className="grid gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate">{r.label}</span>
                  <span className="shrink-0 tabular text-muted-foreground">{r.extra && <span className="mr-2">{r.extra}</span>}<span className="font-medium text-foreground">{r.display ?? r.value}</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
