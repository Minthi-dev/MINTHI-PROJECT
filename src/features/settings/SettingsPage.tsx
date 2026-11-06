import { Bell, Building2, Clock, CreditCard, LayoutGrid, Package, Printer, Receipt, Users, CalendarDays, type LucideIcon } from 'lucide-react'
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { cn } from '@/shared/lib/cn'
import { Select } from '@/shared/ui/controls'
import { PageHeader } from '@/shared/ui/display'
import { BillingSection } from './sections/BillingSection'
import { FiscalSection } from './sections/FiscalSection'
import { FloorSetupSection } from './sections/FloorSetupSection'
import { GeneralSection } from './sections/GeneralSection'
import { PaymentsSection } from './sections/PaymentsSection'
import { PrinterSection } from './sections/PrinterSection'
import { ReservationsSection } from './sections/ReservationsSection'
import { ScheduleSection } from './sections/ScheduleSection'
import { StaffSection } from './sections/StaffSection'
import { TakeawaySection } from './sections/TakeawaySection'

interface Section { id: string; label: string; icon: LucideIcon; ownerOnly?: boolean; component: React.ComponentType }

const SECTIONS: Section[] = [
  { id: 'locale', label: 'Locale', icon: Building2, component: GeneralSection },
  { id: 'orari', label: 'Orari e prezzi', icon: Clock, component: ScheduleSection },
  { id: 'sala', label: 'Sale, tavoli e QR', icon: LayoutGrid, component: FloorSetupSection },
  { id: 'staff', label: 'Staff', icon: Users, component: StaffSection },
  { id: 'asporto', label: 'Asporto', icon: Package, component: TakeawaySection },
  { id: 'prenotazioni', label: 'Prenotazioni', icon: CalendarDays, component: ReservationsSection },
  { id: 'pagamenti', label: 'Pagamenti online', icon: CreditCard, ownerOnly: true, component: PaymentsSection },
  { id: 'scontrini', label: 'Scontrini elettronici', icon: Receipt, ownerOnly: true, component: FiscalSection },
  { id: 'stampante', label: 'Stampante', icon: Printer, component: PrinterSection },
  { id: 'abbonamento', label: 'Abbonamento', icon: Bell, ownerOnly: true, component: BillingSection },
]

export function SettingsPage() {
  const r = useRestaurant()
  const { section = 'locale' } = useParams()
  const navigate = useNavigate()
  const visible = SECTIONS.filter((s) => !s.ownerOnly || r.isOwner)
  const current = visible.find((s) => s.id === section)
  if (!current) return <Navigate to="/app/impostazioni/locale" replace />
  const Component = current.component

  return (
    <>
      <PageHeader title="Impostazioni" />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
        <nav className="hidden lg:block">
          <ul className="sticky top-8 grid gap-0.5">
            {visible.map((s) => (
              <li key={s.id}>
                <NavLink to={`/app/impostazioni/${s.id}`} className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  <s.icon className="size-4" />{s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="lg:hidden">
          <Select value={current.id} onValueChange={(v) => navigate(`/app/impostazioni/${v}`)} options={visible.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <div className="min-w-0 max-w-3xl"><Component /></div>
      </div>
    </>
  )
}
