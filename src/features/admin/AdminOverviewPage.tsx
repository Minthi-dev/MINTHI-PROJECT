import { formatMoney } from '@/shared/lib/format'
import { PageHeader, Skeleton, Stat } from '@/shared/ui/display'
import { useOverview } from './queries'
import { RestaurantsTable } from './AdminRestaurantsPage'

export function AdminOverviewPage() {
  const o = useOverview()
  return (
    <>
      <PageHeader title="Panoramica" description="Andamento della piattaforma negli ultimi 30 giorni." />
      {!o.data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ristoranti attivi" value={`${o.data.activeRestaurants}/${o.data.restaurants}`} />
            <Stat label="Ordini" value={o.data.orders30d} />
            <Stat label="Transato" value={formatMoney(o.data.gmv30d)} hint="Incassi registrati dai locali" />
            <Stat label="Abbonamenti incassati" value={formatMoney(o.data.mrr)} />
          </div>
          <RestaurantsTable rows={[...o.data.perRestaurant].sort((a, b) => b.gmv30d - a.gmv30d).slice(0, 10)} compact />
        </div>
      )}
    </>
  )
}
