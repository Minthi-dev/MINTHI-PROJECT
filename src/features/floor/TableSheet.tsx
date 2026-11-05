import { BellOff, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { elapsed } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Spinner, Tabs } from '@/shared/ui/display'
import { Sheet } from '@/shared/ui/overlay'
import { BillTab } from './BillTab'
import { DetailsTab } from './DetailsTab'
import { ItemsList } from './ItemsList'
import { useClearAssistance, useSessionDetail, type FloorTable } from './queries'

type Tab = 'orders' | 'bill' | 'details'

export function TableSheet({ sessionId, onClose, tables, occupiedTableIds }: { sessionId: string | null; onClose: () => void; tables: FloorTable[]; occupiedTableIds: Set<string> }) {
  const r = useRestaurant()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('orders')
  const detail = useSessionDetail(sessionId)
  const clearAssistance = useClearAssistance()
  const d = detail.data
  const tableName = (d?.session as { tables?: { name?: string } } | undefined)?.tables?.name ?? ''

  return (
    <Sheet
      open={!!sessionId}
      onOpenChange={(o) => { if (!o) { onClose(); setTab('orders') } }}
      title={`Tavolo ${tableName}`}
      description={d ? `${d.session.guests} persone · aperto da ${elapsed(d.session.opened_at)}${d.pin ? ` · PIN ${d.pin}` : ''}` : undefined}
      width="lg"
    >
      {!d ? <Spinner /> : (
        <div className="flex min-h-full flex-col">
          {d.session.assistance_requested_at && (
            <Callout tone="warning" className="m-4 mb-0" title="Il tavolo chiede assistenza">
              <Button size="sm" variant="outline" className="mt-2" onClick={() => clearAssistance.mutate(d.session.id)}><BellOff />Segna come gestito</Button>
            </Callout>
          )}
          <div className="sticky top-0 z-10 bg-background px-4 pt-3">
            <Tabs value={tab} onChange={setTab} items={[
              { value: 'orders', label: 'Ordini', count: d.items.filter((i) => i.status !== 'cancelled').length },
              { value: 'bill', label: 'Conto' },
              { value: 'details', label: 'Dettagli' },
            ]} />
          </div>
          <div className="flex-1 p-4">
            {tab === 'orders' && (
              <div className="grid gap-4">
                {r.isFloorStaff && (
                  <Button size="lg" onClick={() => navigate(`/app/sala/${d.session.id}/ordina`)}><Plus />Aggiungi ordine</Button>
                )}
                <ItemsList items={d.items} orders={d.orders} />
              </div>
            )}
            {tab === 'bill' && <BillTab sessionId={d.session.id} payments={d.payments} receipts={d.receipts} onClosed={onClose} />}
            {tab === 'details' && <DetailsTab detail={d} tables={tables} occupiedTableIds={occupiedTableIds} />}
          </div>
        </div>
      )}
    </Sheet>
  )
}
