import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { rpc } from '@/shared/lib/api'
import { Logo } from '@/shared/ui/logo'

interface Display { restaurant: { name: string; logoUrl: string | null } | null; preparing: number[]; ready: number[] }

/** Schermo TV per il banco: numeri in preparazione e pronti. Si aggiorna ogni 4 secondi. */
export function DisplayPage() {
  const { restaurantId = '' } = useParams()
  const d = useQuery({
    queryKey: ['display', restaurantId],
    queryFn: async () => (await rpc('get_takeaway_display', { p_restaurant_id: restaurantId })) as unknown as Display,
    refetchInterval: 4000,
  })
  const data = d.data
  return (
    <div className="dark flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-10 py-6">
        <h1 className="text-3xl font-semibold">{data?.restaurant?.name}</h1>
        <Logo />
      </header>
      <div className="grid flex-1 grid-cols-2 gap-6 px-10 pb-10">
        <section className="rounded-3xl bg-surface p-8">
          <h2 className="mb-6 text-2xl font-semibold text-muted-foreground">In preparazione</h2>
          <div className="flex flex-wrap gap-4">
            {data?.preparing.map((n) => <span key={n} className="min-w-28 rounded-2xl bg-muted px-6 py-4 text-center text-5xl font-bold tabular">{n}</span>)}
          </div>
        </section>
        <section className="rounded-3xl bg-primary/15 p-8 ring-2 ring-primary/40">
          <h2 className="mb-6 text-2xl font-semibold text-primary">Pronti al ritiro</h2>
          <div className="flex flex-wrap gap-4">
            {data?.ready.map((n) => <span key={n} className="min-w-28 animate-in zoom-in-50 rounded-2xl bg-primary px-6 py-4 text-center text-6xl font-bold text-primary-foreground tabular">{n}</span>)}
          </div>
        </section>
      </div>
    </div>
  )
}
