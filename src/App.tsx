import React, { useEffect, useState, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SessionProvider } from './context/SessionContext'
import { supabase } from './lib/supabase'

import { lazyImportRetry } from './utils/lazyImportRetry'

// Lazy loaded components for code splitting (with auto-retry on chunk error)
const LoginPage = lazyImportRetry(() => import('./components/LoginPage'))
const RestaurantDashboard = lazyImportRetry(() => import('./components/RestaurantDashboard'))
const AdminDashboard = lazyImportRetry(() => import('./components/AdminDashboard'))
const WaiterDashboard = lazyImportRetry(() => import('./components/waiter/WaiterDashboard'))
const WaiterOrderPage = lazyImportRetry(() => import('./components/waiter/WaiterOrderPage'))
const CustomerMenu = lazyImportRetry(() => import('./components/CustomerMenu'))
const PublicReservationPage = lazyImportRetry(() => import('./components/reservations/PublicReservationPage'))
const RestaurantOnboarding = lazyImportRetry(() => import('./components/RestaurantOnboarding'))
const RegisterSuccessPage = lazyImportRetry(() => import('./components/RegisterSuccessPage'))
const LandingPage = lazyImportRetry(() => import('./components/LandingPage'))

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center h-screen gap-6 bg-black text-amber-50 px-4 relative overflow-hidden">
    {/* Ambient Background */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[150px] opacity-40" />
    </div>

    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative z-10 flex flex-col items-center gap-6"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
      >
        <img src="/minthi-logo.png" alt="MINTHI" className="h-24 w-auto drop-shadow-[0_0_25px_rgba(52,211,153,0.3)]" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col items-center gap-4 mt-2"
      >
        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">Caricamento in corso...</p>
      </motion.div>
    </motion.div>
  </div>
)

// Route Guard for Admin/Staff
const ProtectedRoute = ({ children, user, loading }: { children: React.ReactNode, user: any, loading: boolean }) => {
  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/" replace />

  return React.cloneElement(children as React.ReactElement<any>, { user })
}

// Redirect wrapper for legacy QR Codes that hit `/menu?tableId=XYZ`
const LegacyCustomerMenuRedirect = () => {
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('tableId')
  if (tableId) {
    return <Navigate to={`/client/table/${tableId}`} replace />
  }
  return <Navigate to="/" replace />
}

// Redirect wrapper for legacy QR Codes that hit `/menu/XYZ`
const LegacyPathRedirect = () => {
  const location = useLocation()
  const pathParts = location.pathname.split('/')
  const tableId = pathParts[pathParts.length - 1]
  if (tableId && tableId !== 'menu') {
    return <Navigate to={`/client/table/${tableId}`} replace />
  }
  return <Navigate to="/" replace />
}

const AppContent = () => {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check localStorage for saved user first
    const savedUser = localStorage.getItem('minthi_user')
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser)
        setUser(parsedUser)
        setLoading(false)
        return
      } catch (e) {
        localStorage.removeItem('minthi_user')
      }
    }

    // Fallback to Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('minthi_user')
    supabase.auth.signOut()
    setUser(null)
  }

  const getRedirectPath = (user: any) => {
    if (!user) return '/'
    if (user.role === 'ADMIN') return '/admin'
    if (user.role === 'STAFF') return '/waiter'
    return '/dashboard'
  }

  return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* LANDING PAGE — public, no auth */}
          <Route path="/info" element={<LandingPage />} />

          {/* PUBLIC / ADMIN LOGIN */}
          <Route
            path="/"
            element={
              !user
                ? <LoginPage onLogin={(u) => setUser(u)} />
                : <Navigate to={getRedirectPath(user)} replace />
            }
          />

          {/* ADMIN DASHBOARD (for ADMIN role - manages all restaurants) */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute user={user} loading={loading}>
                <AdminDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* RESTAURANT DASHBOARD (for OWNER role - single restaurant) */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute user={user} loading={loading}>
                <RestaurantDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* WAITER DASHBOARD */}
          <Route
            path="/waiter"
            element={
              <ProtectedRoute user={user} loading={loading}>
                <WaiterDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/waiter/table/:tableId/order"
            element={
              <ProtectedRoute user={user} loading={loading}>
                <WaiterOrderPage />
              </ProtectedRoute>
            }
          />

          {/* CUSTOMER ROUTES */}
          <Route path="/client/table/:tableId" element={<CustomerMenu />} />
          {/* Support for existing physical QR codes */}
          <Route path="/menu/:tableId" element={<LegacyPathRedirect />} />
          <Route path="/menu" element={<LegacyCustomerMenuRedirect />} />
          <Route path="/book/:restaurantId" element={<PublicReservationPage />} />
          <Route path="/register/:token" element={<RestaurantOnboarding />} />
          <Route path="/register" element={<RestaurantOnboarding />} />
          <Route path="/register-success" element={<RegisterSuccessPage />} />
          <Route path="/register-cancelled" element={<Navigate to="/" replace />} />

          {/* Fallback for unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <Toaster position="top-center" expand={false} richColors visibleToasts={2} duration={2500} toastOptions={{ style: { marginTop: 'env(safe-area-inset-top, 0px)' } }} />
    </>
  )
}

function App() {
  const location = useLocation()

  // Landing page is fully public — no auth, no session, no loading
  if (location.pathname === '/info') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LandingPage />
      </Suspense>
    )
  }

  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  )
}

export default App