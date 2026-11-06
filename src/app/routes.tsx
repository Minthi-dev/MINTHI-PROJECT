import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { RequireAdmin, RequireStaff, StaffHome } from '@/features/auth/guards'
import { FullScreenLoader } from './FullScreenLoader'

const page = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))

// pubblico
const LandingPage = page(() => import('@/features/landing/LandingPage'), 'LandingPage')
const LoginPage = page(() => import('@/features/auth/LoginPage'), 'LoginPage')
const ForgotPasswordPage = page(() => import('@/features/auth/PasswordPages'), 'ForgotPasswordPage')
const ResetPasswordPage = page(() => import('@/features/auth/PasswordPages'), 'ResetPasswordPage')
const RegisterPage = page(() => import('@/features/auth/RegisterPage'), 'RegisterPage')
const TablePage = page(() => import('@/features/customer/TablePage'), 'TablePage')
const TakeawayMenuPage = page(() => import('@/features/public/TakeawayMenuPage'), 'TakeawayMenuPage')
const TakeawayStatusPage = page(() => import('@/features/public/TakeawayStatusPage'), 'TakeawayStatusPage')
const BookingPage = page(() => import('@/features/public/BookingPage'), 'BookingPage')
const DisplayPage = page(() => import('@/features/public/DisplayPage'), 'DisplayPage')
const QrRedirectPage = page(() => import('@/features/public/QrRedirectPage'), 'QrRedirectPage')

// staff
const AppShell = page(() => import('@/features/shell/AppShell'), 'AppShell')
const FloorPage = page(() => import('@/features/floor/FloorPage'), 'FloorPage')
const OrderComposerPage = page(() => import('@/features/floor/OrderComposerPage'), 'OrderComposerPage')
const OrdersPage = page(() => import('@/features/orders/OrdersPage'), 'OrdersPage')
const KitchenPage = page(() => import('@/features/kitchen/KitchenPage'), 'KitchenPage')
const TakeawayBoardPage = page(() => import('@/features/takeaway/TakeawayBoardPage'), 'TakeawayBoardPage')
const ReservationsPage = page(() => import('@/features/reservations/ReservationsPage'), 'ReservationsPage')
const MenuPage = page(() => import('@/features/menu/MenuPage'), 'MenuPage')
const AnalyticsPage = page(() => import('@/features/analytics/AnalyticsPage'), 'AnalyticsPage')
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage')
const AccountPage = page(() => import('@/features/account/AccountPage'), 'AccountPage')

// admin
const AdminShell = page(() => import('@/features/admin/AdminShell'), 'AdminShell')
const AdminOverviewPage = page(() => import('@/features/admin/AdminOverviewPage'), 'AdminOverviewPage')
const AdminRestaurantsPage = page(() => import('@/features/admin/AdminRestaurantsPage'), 'AdminRestaurantsPage')
const AdminInvitesPage = page(() => import('@/features/admin/AdminInvitesPage'), 'AdminInvitesPage')
const AdminQrPage = page(() => import('@/features/admin/AdminQrPage'), 'AdminQrPage')
const AdminConfigPage = page(() => import('@/features/admin/AdminConfigPage'), 'AdminConfigPage')

function LegacyRegister() {
  const { token } = useParams()
  return <Navigate to={`/registrati/${token}`} replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/info" element={<Navigate to="/" replace />} />
        <Route path="/accedi" element={<LoginPage />} />
        <Route path="/password-dimenticata" element={<ForgotPasswordPage />} />
        <Route path="/reimposta-password" element={<ResetPasswordPage />} />
        <Route path="/registrati/:token" element={<RegisterPage />} />
        <Route path="/register/:token" element={<LegacyRegister />} />

        <Route path="/t/:token" element={<TablePage />} />
        <Route path="/asporto/ordine/:token" element={<TakeawayStatusPage />} />
        <Route path="/asporto/:restaurantId" element={<TakeawayMenuPage />} />
        <Route path="/prenota/:restaurantId" element={<BookingPage />} />
        <Route path="/display/:restaurantId" element={<DisplayPage />} />
        <Route path="/qr/:code" element={<QrRedirectPage />} />

        <Route path="/app" element={<RequireStaff><AppShell /></RequireStaff>}>
          <Route index element={<StaffHome />} />
          <Route path="sala" element={<FloorPage />} />
          <Route path="sala/:sessionId/ordina" element={<OrderComposerPage />} />
          <Route path="ordini" element={<OrdersPage />} />
          <Route path="cucina" element={<KitchenPage />} />
          <Route path="asporto" element={<TakeawayBoardPage />} />
          <Route path="prenotazioni" element={<ReservationsPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="analitiche" element={<AnalyticsPage />} />
          <Route path="impostazioni" element={<Navigate to="locale" replace />} />
          <Route path="impostazioni/:section" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>

        <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="ristoranti" element={<AdminRestaurantsPage />} />
          <Route path="inviti" element={<AdminInvitesPage />} />
          <Route path="qr" element={<AdminQrPage />} />
          <Route path="configurazione" element={<AdminConfigPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
